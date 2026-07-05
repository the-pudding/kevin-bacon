import adapterStatic from "@sveltejs/adapter-static";
import { sveltePreprocess } from "svelte-preprocess";
import autoprefixer from "autoprefixer";

const preprocess = sveltePreprocess({
	postcss: {
		plugins: [autoprefixer]
	},
	typescript: {
		// the TS pass reads a root tsconfig.json, which this repo doesn't have
		// (jsconfig.json owns editor tooling) — supply compiler options inline
		tsconfigFile: false,
		compilerOptions: {
			verbatimModuleSyntax: true,
			moduleResolution: "bundler",
			module: "ESNext",
			target: "ESNext"
		}
	}
});

const config = {
	compilerOptions: {
		runes: true
	},
	preprocess,
	kit: {
		adapter: adapterStatic({ strict: false })
	}
};

export default config;
