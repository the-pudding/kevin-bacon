// Minimal reader for the NumPy arrays the analysis repo exports alongside its
// JSON (see build-scrolly-nodes.js). Build-time only — nothing here ships to the
// browser.
//
// Deliberately narrow: it reads a .npz whose entries are STORED (np.savez, not
// np.savez_compressed) and little-endian float64/int64 .npy v1/v2 payloads. That
// is exactly what the analysis repo writes, and anything else throws rather than
// guessing — a silently mis-decoded matrix would produce plausible-looking but
// wrong story data.
import fs from "node:fs";

const LOCAL_SIG = 0x04034b50;
const LOCAL_HEADER = 30;
const NPY_MAGIC = "\x93NUMPY";

/** the dtypes the analysis repo's exports actually use */
const DTYPES = {
	"<f8": Float64Array,
	"<i8": BigInt64Array,
	"<i4": Int32Array
};

const ZIP64_EXTRA_ID = 0x0001;
const SIZE_IN_ZIP64 = 0xffffffff;

/**
 * One entry's byte length. np.savez writes its members with force_zip64, so the
 * 32-bit size fields are sentinels and the real length lives in the zip64 extra
 * field (id 1: uncompressed size, then compressed size, both 8-byte LE).
 * @param {Buffer} buf
 * @param {number} at offset of the local file header
 * @param {number} extraAt offset of the extra field
 * @param {number} extraLen
 */
function entrySize(buf, at, extraAt, extraLen) {
	const size = buf.readUInt32LE(at + 18);
	if (size !== SIZE_IN_ZIP64) return size;
	let scan = extraAt;
	while (scan + 4 <= extraAt + extraLen) {
		const id = buf.readUInt16LE(scan);
		const len = buf.readUInt16LE(scan + 2);
		if (id === ZIP64_EXTRA_ID) return Number(buf.readBigUInt64LE(scan + 4));
		scan += 4 + len;
	}
	throw new Error("read-npy: zip64 size sentinel with no zip64 extra field");
}

/**
 * The stored entries of a zip archive, in file order.
 * @param {Buffer} buf
 * @returns {Map<string, Buffer>} entry name → its raw (uncompressed) bytes
 */
function zipEntries(buf) {
	const entries = new Map();
	let at = 0;
	while (at + LOCAL_HEADER <= buf.length) {
		if (buf.readUInt32LE(at) !== LOCAL_SIG) break;
		const method = buf.readUInt16LE(at + 8);
		const nameLen = buf.readUInt16LE(at + 26);
		const extraLen = buf.readUInt16LE(at + 28);
		const name = buf.toString(
			"utf8",
			at + LOCAL_HEADER,
			at + LOCAL_HEADER + nameLen
		);
		const size = entrySize(buf, at, at + LOCAL_HEADER + nameLen, extraLen);
		if (method !== 0) {
			throw new Error(
				`read-npy: ${name} is compressed (method ${method}); this reader only ` +
					"handles stored entries, as written by np.savez"
			);
		}
		const start = at + LOCAL_HEADER + nameLen + extraLen;
		entries.set(name, buf.subarray(start, start + size));
		at = start + size;
	}
	if (!entries.size) throw new Error("read-npy: no stored zip entries found");
	return entries;
}

/**
 * Decode one .npy payload.
 * @param {Buffer} buf
 * @param {string} name for error messages
 * @returns {{ shape: number[], data: Float64Array|BigInt64Array|Int32Array }}
 */
function readNpy(buf, name) {
	if (buf.toString("latin1", 0, 6) !== NPY_MAGIC) {
		throw new Error(`read-npy: ${name} is not a .npy payload`);
	}
	const major = buf[6];
	const headerLen = major === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8);
	const dictAt = major === 1 ? 10 : 12;
	const header = buf.toString("latin1", dictAt, dictAt + headerLen);
	const descr = header.match(/'descr':\s*'([^']+)'/)?.[1];
	const Ctor = DTYPES[descr];
	if (!Ctor)
		throw new Error(`read-npy: ${name} has unsupported dtype ${descr}`);
	if (!/'fortran_order':\s*False/.test(header)) {
		throw new Error(`read-npy: ${name} is Fortran-ordered`);
	}
	const shape = (header.match(/'shape':\s*\(([^)]*)\)/)?.[1] ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map(Number);
	const start = dictAt + headerLen;
	const count = shape.reduce((a, b) => a * b, 1);
	const bytes = count * Ctor.BYTES_PER_ELEMENT;
	if (buf.length - start !== bytes) {
		throw new Error(
			`read-npy: ${name} payload is ${buf.length - start} bytes, ` +
				`but shape ${shape} × ${descr} needs ${bytes}`
		);
	}
	// copy rather than view: the slice's offset is not guaranteed to be aligned
	// to the element size, which a typed-array view over the same memory requires
	return {
		shape,
		data: new Ctor(
			buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + start + bytes)
		)
	};
}

/**
 * Read the named arrays out of a .npz. Named rather than all-of-them: an archive
 * may also hold arrays in dtypes this reader has no business decoding (the
 * simulation matrix ships beside a `<U22` array of actor names), and those are
 * not worth supporting for a caller that never reads them.
 * @param {string} file
 * @param {string[]} names array names, without the `.npy` suffix
 * @returns {Record<string, { shape: number[], data: Float64Array|BigInt64Array|Int32Array }>}
 */
export function readNpz(file, names) {
	const entries = zipEntries(fs.readFileSync(file));
	return Object.fromEntries(
		names.map((name) => {
			const bytes = entries.get(`${name}.npy`);
			if (!bytes) {
				throw new Error(
					`read-npy: ${file} has no ${name}.npy (holds ${[...entries.keys()].join(", ")})`
				);
			}
			return [name, readNpy(bytes, name)];
		})
	);
}
