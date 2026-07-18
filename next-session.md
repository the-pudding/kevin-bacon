# Handoff: Gate rank-chapter advancement on SLJ guess or give-up

## Starting Prompt

In `kevin-bacon`, the rank-guessing chapter (`rankFocus` step, `src/components/Index.svelte:134`) currently lets the reader hit "Next" and move to the `rankReveal` step regardless of whether they've guessed correctly. The goal: block that specific transition until the reader either guesses Samuel L. Jackson (`story.rankGuess === SLJ`) or gives up (`story.rankGaveUp === true`).

Context: the prior session fixed `RankBars.svelte`/`GuessRank.svelte` so a guess only reveals the guessed actor's name (not the whole list), and added a "Give up" button next to "Guess again" in `GuessRank.svelte` that sets `story.rankGaveUp = true` and reveals #1 (SLJ).

There is currently **no existing gating mechanism** for "can't advance past this step until some condition is met" — `Wizard.svelte`'s Next button (`src/components/helpers/Wizard.svelte:39`) is only disabled at `value >= count - 1` (last step). `Step.svelte`'s `ready` prop is unrelated — it gates whether a step's _visual_ ships in production, not navigation. You'll need to design a new mechanism, e.g.:

- A per-step `canAdvance` snippet/prop threaded from `Step.svelte` into `Wizard.svelte`'s Next-disabled logic, evaluated only for the currently active step.
- Or a simpler `Wizard` prop like `bind:canAdvance` that `Index.svelte` sets via a `$derived` reading `story.rankGuess`/`story.rankGaveUp` when `currentState === "rankFocus"`.

Read `notes/scrolly-framework.md` first — it documents the step-driver contract and may already have conventions for this kind of thing. Keep the mechanism generic enough to reuse for other steps if it makes sense, but don't over-engineer for hypothetical future gates beyond what's asked.

First thing to do: read `Wizard.svelte` and `Step.svelte` in full, and decide the prop-threading approach before writing code.

## Relevant Files

- `src/components/helpers/Wizard.svelte` — step driver; Next/Previous buttons live here, no gating today.
- `src/components/scrolly/Step.svelte` — per-step config (`state`, `params`, `ready`, `panel`); likely needs a new prop here.
- `src/components/Index.svelte` — registers all `<Step>`s; `rankFocus`/`rankReveal` steps at lines 134–148; `stepConfigs` array built via `steps.register(...)`.
- `src/components/scrolly/GuessRank.svelte` — owns `story.rankGuess` / `story.rankGaveUp` writes (guess picking, give-up button).
- `src/components/scrolly/story.svelte.js` — shared state; `rankGuess`, `rankGaveUp` fields already exist.
- `src/components/scrolly/layout-shared.js` — exports `SLJ` (the correct-answer id) for the guess check.

## Key Context

- `story.rankGuess` holds the guessed node id (or `null`); `story.rankGaveUp` is a boolean set by the Give-up button.
- Correct guess is detected via `nodeRank(story.rankGuess) === 1` (see `GuessRank.svelte`), not by comparing ids directly — reuse that pattern for consistency, though comparing to `SLJ` id is equivalent.
- `RankBars.svelte`'s `focusId`/`namesRevealed` already treat `reveal || story.rankGaveUp` as "fully revealed" — the new gating logic should likely key off the same two conditions (`nodeRank(story.rankGuess) === 1` or `story.rankGaveUp`).
- Formatting: run `npx prettier --write <file>` after edits — this repo has no separate linter, `npm run lint` is a Prettier check.
