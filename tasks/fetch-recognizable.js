// Pulls the fame scores the actor search's pool is drawn from out of the sdokb
// Supabase project and commits them as data/recognizable-actors.json.
//
// Fame is not something this corpus knows. Closeness rank, film count and
// costar degree are all measures of how much an actor WORKS, and the story is
// substantially about young actors who have not worked much yet — rank a search
// pool by any of them and Tom Holland, Zendaya and Sydney Sweeney fall out of it
// while the prolific character actors nobody searches for stay in. sdokb already
// carries a hand-tuned 0-10 Recognizability per person, so the pool borrows it.
//
// Fetched here rather than in build-scrolly-nodes.js on purpose: that build is
// deterministic, offline and byte-stable by contract (see its header), and a
// live query inside it would make the committed data depend on whatever the
// table said that afternoon. This is the same split as ANALYSIS_REPO — an
// export lands as a file, the build reads files.
//
//   SDOKB_URL=… SDOKB_KEY=… npm run fetch-recognizable
//
// Both are in the sdokb checkout's .env (PUBLIC_SUPABASE_URL and
// PUBLIC_SUPABASE_ANON_KEY). The key is the publishable anon one and the table
// is world-readable, so nothing secret is needed to re-run this — but nothing
// is read from a checkout either, so this never depends on where sdokb is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Above this, an actor is someone a reader might plausibly go looking for. 988
// people at the time of writing — the right ORDER of magnitude for a search box,
// where 10 results are a menu and 10,000 are a phone book.
const MIN_RECOGNIZABILITY = 7;
const PAGE = 1000;

const url = process.env.SDOKB_URL;
const key = process.env.SDOKB_KEY;
if (!url || !key) {
	throw new Error(
		"fetch-recognizable: SDOKB_URL and SDOKB_KEY must both be set. They are " +
			"PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in the sdokb checkout's .env."
	);
}

async function page(offset) {
	const query = new URLSearchParams({
		select: "person_id,name,Recognizability",
		Recognizability: `gt.${MIN_RECOGNIZABILITY}`,
		order: "person_id.asc",
		limit: String(PAGE),
		offset: String(offset)
	});
	const res = await fetch(`${url}/rest/v1/actors?${query}`, {
		headers: { apikey: key, Authorization: `Bearer ${key}` }
	});
	if (!res.ok) {
		throw new Error(`fetch-recognizable: ${res.status} ${res.statusText}`);
	}
	return res.json();
}

const byPid = new Map();
for (let offset = 0; ; offset += PAGE) {
	const rows = await page(offset);
	for (const row of rows) byPid.set(row.person_id, row);
	if (rows.length < PAGE) break;
}

// person_id order, so a re-run with no change to the table is byte-identical
const actors = [...byPid.values()]
	.sort((a, b) => a.person_id - b.person_id)
	.map((row) => [row.person_id, row.name, row.Recognizability]);

if (actors.length < 500) {
	throw new Error(
		`fetch-recognizable: only ${actors.length} actors over ${MIN_RECOGNIZABILITY} — ` +
			"the table or the threshold has moved; check before committing this"
	);
}

const dest = path.join(root, "data/recognizable-actors.json");
fs.writeFileSync(
	dest,
	JSON.stringify({ minRecognizability: MIN_RECOGNIZABILITY, actors }) + "\n"
);
console.log(
	`wrote ${dest}: ${actors.length} actors scoring over ${MIN_RECOGNIZABILITY}`
);
