# Handoff: make the actor search a subtle easter egg

## Starting Prompt

The actor search is built, measured and committed. Everything below the surface
is good and stays: the data pipeline, the canvas highlight on four charts, the
flight animation, the search index and the Supabase recording. **Only the way
the reader reaches it is wrong.**

Today it is a full-width combobox with the placeholder "Search for an actor…"
sitting in the prose flow on steps 6, 18, 19 and 26, plus a persistent readout
carrying a coloured dot, the name, the degree, a "Clear" button and (on step 6)
the route back to Bacon. Owen's words: it is "too in your face". He wants **a
subtle easter egg rather than part of the text, not a CTA anywhere, just
something that would delight a reader on the way past.**

Four decisions are already made (Owen, this session):

1. **Keep the search; hide the way in.** The lookup survives intact — a reader
   must still be able to go looking for Tom Holland. What goes is the affordance:
   no input in the prose, no placeholder sentence. A small glyph is the entry
   point, because a keyboard shortcut alone is dead on mobile and the checklist
   tests 320 and 375px. Put the keyboard path in as well if it is free, but it
   cannot be the only way in.
2. **The answer is a canvas label.** The dot takes its name exactly as every
   other named dot in the story does — `withSearchLabel` already does this and
   `createLabelStacker` already de-collides it. The readout block in the card
   goes away entirely.
3. **The same four steps.** 6 (`hopBands`), 18 (`scatterCenters`),
   19 (`degScatter`), 26 (`careerMany`). No new steps, no renumbering.
4. **The route to Bacon stays, on the hop chart only.**

One call left to me rather than asked, flagged here so it can be overturned:
decisions 2 and 4 together leave the route homeless — it is not prose, and it
is too much text to sit on a 22,530-dot chart as a `notes` entry. **Assume it
lives in the same popover the glyph opens**, shown after a pick, so the reader
sees "…was in Avengers: Infinity War (2018) with Benedict Cumberbatch, who was
in Black Mass (2015) with Kevin Bacon", the popover closes, and what is left on
screen is a named purple dot. If Owen wants it elsewhere, that is the thing to
re-ask.

Do first: read `notes/design/interactions.md` rule 1b (this control's own
rules — it will need rewriting), then the "Interactive steps" and "Panels"
sections of `notes/scrolly-framework.md`.

## Relevant Files

| File                                          | Why                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scrolly/ActorSearch.svelte`   | The whole of the change. The combobox, the readout, the Clear button, the route list, the reserved-height box and the flight all live here. |
| `src/components/Index.svelte`                 | The four mount points (~:306, 419, 429, 510) and the comment block above the first. The prose above each stays Owen's.                      |
| `src/components/ui/Combobox.svelte`           | Already portalled, which is most of the way to a popover. Keep.                                                                             |
| `src/components/scrolly/fly-to-dot.js`        | The shared flight. See the warning below — its source element is the problem.                                                               |
| `src/components/scrolly/search.js`            | The index. **Unchanged by this work.**                                                                                                      |
| `src/components/scrolly/ScrollyVisual.svelte` | `locate()` (the flight target), the derived `TRACKED_IDS`, and `.hits` at `--z-tap-above` if a canvas affordance is ever wanted.            |
| `src/components/scrolly/Stage.svelte`         | Where chart furniture and the title sit, if the glyph goes beside the title.                                                                |
| `notes/design/interactions.md`                | Rule 1b is written for a card control and will be wrong.                                                                                    |
| `notes/tween-checklist.md`                    | Rows 6/18/19/26 carry search notes that will need rewording.                                                                                |

## Key Context

**Committed and green.** `kevin-bacon`: `22e3f82` (golden fix), `09e94bb` (the
feature), `642ca49` (the fame-based pool). `pudding-post`: `ce71258` (the route
export). `npm run gates` passes, 382 tests.

**The flight's source element is the one real trap.** `flyToDot` needs a DOM
element with a box to animate from, and it was deliberately put in the step
card because a portalled element unmounts when its popover closes — mid-flight,
if the popover closes on pick. Solve it explicitly: either hold the popover open
until the flight lands, or fly a transient clone appended to `body`. Do not
discover this by watching a chip vanish.

**Deleting the card block deletes its machinery.** `reserveLines`,
`--reserve-wrap`, the `MAX_PATH_STEPS`-driven `min-height` and the
`.actor-search__out` / `__found` / `__chip` / `__clear` / `__path` markup all
exist only to stop the card changing height. If the control leaves the card,
remove them rather than leaving them behind — and re-measure, because
`overlayHeight` is what half the canvas's bottom clearances come off. The
current build measures **0.0px delta** at 320/375/390/430 through menu-open,
flight and settle; whatever replaces it should be measured the same way with
Playwright, not reasoned about.

**Do not let the glyph become a CTA by accident.** The brief is "no call to
action anywhere". A glyph with a label beside it, or one that pulses, is the
thing Owen has just rejected in another form.

**The pool** is `Recognizability > 7` from the sdokb Supabase project, unioned
with everyone the story names or draws, intersected with the actors all four
charts can place: 1,449 people. Regenerate the fame input with
`SDOKB_URL=… SDOKB_KEY=… npm run fetch-recognizable` (both are
`PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` in the `sdokb` checkout's
`.env`; there is no Supabase MCP connector in these sessions). Known gaps: Paul
Mescal is out, and 21 recognisable people are absent from the corpus entirely
(Ariana Grande, Harry Styles — musicians with too few films).

**Analytics is live.** Owen has run `supabase/schema.sql`, so `actor_searches`
exists. `recordActorSearch({ actorId, chart })` sends `chart` as one of
`hops` / `remoteness` / `costars` / `career`; keep that meaningful.

**Sign-off is outstanding.** No contact sheets have ever been run for these four
transitions (`npm run sheet -- <from> <to>`, the `tween-sheet` skill, read
against `notes/design/motion.md`). Rows 6/18/19/26 are `[!]` and only Owen marks
a row `[x]`. Run `npm run stale` from the staged diff after any change.

**Concurrency.** Owen edits this repo in parallel — three times this session his
work appeared mid-task (the em-dash copy pass, then the race callouts, landed as
`f61e574`). Check `git status` before staging and commit only your own files.

**This file** is tracked in git, not ignored; it previously held a stale handoff
from the galaxy work and was overwritten.
