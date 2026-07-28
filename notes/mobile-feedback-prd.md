# Mobile review feedback — prototype PRD (2026-07-27)

Source: Owen's mobile pass, `feedback.md`. Goal for this stage: information
coherence, not polish. Items are split into **Must-fix** (comprehension or
correctness issues — blocking for end of prototype) and **Polish** (deferred
past prototype). Status column tracks build state, not review state.

## Must-fix

Priority is importance vs. implementation complexity, checked against the
actual code (`states.js`/`layouts/*.js`/components), not guessed:

- **Quick win** — high importance, low complexity. Do these first.
- **Core fix** — worth the effort, but touches more than one place or needs
  a real state/data change.
- **Bigger lift** — schedule deliberately; either the fix reaches across
  every step of a chapter or the underlying mechanism doesn't exist yet.

| ID   | Step               | Item                                                                                     | Priority    | Why                                                                                                                  | Status   |
| ---- | ------------------ | ---------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| FB19 | 18                 | Show Julie Walters on each graph with distinctive colour, to prove her two disadvantages | Quick win   | She already has a defined colour — just missing from the concurrence/degree highlight map. Add one entry.            | Done     |
| FB07 | 4                  | Show the average distances always                                                        | Quick win   | Gated behind a single `{#if}` — remove it.                                                                           | Done     |
| FB09 | 5                  | Show the average distances always                                                        | Quick win   | Same gate as FB07.                                                                                                   | Done     |
| FB01 | 3                  | "1 movie, 2 movie, ..." unclear — reword (e.g. "1 movie away")                           | Quick win   | One template string in `hop-bands.js`.                                                                               | Done     |
| FB16 | 8                  | Remove Emmet Walsh                                                                       | Quick win   | One id to filter out of the race-series list.                                                                        | Done     |
| FB21 | 18                 | Text overlap — Seth Rogen next to his node, Natalie Portman a bit lower                  | Quick win   | Label decollider exists but two direction entries are missing.                                                       | Done     |
| FB15 | 7                  | Names overlapping at end of animation                                                    | Core fix    | Decollider is already wired in here — this is constant tuning, not new work.                                         | Not done |
| FB23 | 26                 | No text                                                                                  | Core fix    | Copy already exists in source; likely a mobile-only clipping issue — needs a live repro before scoping the real fix. | Not done |
| FB03 | 4                  | Subsequent guesses shouldn't clear out existing guesses                                  | Core fix    | Guess state is a single scalar; needs reshaping into a small history across two files.                               | Not done |
| FB18 | 12                 | Show more indication of right/wrong answer                                               | Core fix    | Ambiguous reveal was a deliberate design choice — reversing it touches the reveal animation.                         | Not done |
| FB12 | Race chart general | Stretch x-axis to show every year                                                        | Core fix    | Done: fixed 32px/year on every race step, every year labelled, reader pans the camera (see scrolly-framework.md).    | Done     |
| FB22 | 22                 | Weird sampling — whitespace before films = 20, denser after                              | Bigger lift | It's a log-scale domain issue that affects every films-scatter step — fix needs validating across all of them.       | Not done |
| FB17 | 9                  | Needs natural scrolling direction on mobile                                              | Bigger lift | No gesture/touch handling exists in the wizard at all — new framework-level work.                                    | Not done |

## Polish (deferred)

| ID   | Step               | Item                                                          | Status   |
| ---- | ------------------ | ------------------------------------------------------------- | -------- |
| FB02 | 4                  | Make horizontal bars more dot-based, like the waffle bars     | Not done |
| FB04 | 4                  | Animate to the guess, then show                               | Not done |
| FB05 | 4                  | Re-use the quiz blur component, bottom feels crowded          | Not done |
| FB06 | 4                  | Scroll up to the guess a bit slower                           | Not done |
| FB08 | 4                  | Slightly blurred at the top of #1                             | Not done |
| FB10 | 5                  | Slightly blurred at the top                                   | Not done |
| FB11 | 6                  | Tween into it isn't great                                     | Not done |
| FB13 | Race chart general | Subtle horizontal grid lines                                  | Not done |
| FB14 | 7                  | Y-axis could be shrunk — lots of whitespace at the bottom     | Not done |
| FB20 | 18                 | Draw a line between pairs of actors to show they're connected | Not done |
| FB24 | General            | Round consistently                                            | Not done |
