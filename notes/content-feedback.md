# Content feedback — `Index.svelte`

Scoped to your three asks only: (1) clearest way to show the information, (2) insights that would hammer the point home, (3) self-contradictions. Steps referenced by the `value === N` id in the code. A single non-content bug is noted at the very end because it silently kills two steps.

---

## 3. Self-contradictions / internal inconsistencies

_(Leading with these — they're the most objective.)_

- **C1 — Concurrency number doesn't match its own explanation (Step 15).** "a concurrency of **0.2** means … he would have worked with **28%** of them before." 0.2 ≠ 28%. Your storyboard has `0.28`, so this is a transcription slip in the post — should read **0.28 → 28%**. Left as-is it's a visible math error in the one place you're defining a new metric.

- **C2 — "Four Degrees of SLJ" contradicts the KB max you just gave (Steps 3 → 6).** Step 3 says you reach Kevin Bacon "in **four** movies or less" (and no one is 5 away). Step 6 then brands SLJ "the **Four** Degrees of Samuel L. Jackson" as the upgrade over KB. But KB's ceiling is _also_ four — and Step 4 says 16,429 actors share that within-4 property, i.e. the ceiling is unremarkable. So the nickname implies a max-hops contrast that doesn't exist; SLJ's actual edge is **average** distance (2.09 vs 2.28). Suggest either dropping the "four degrees" framing or explicitly saying "same ceiling, but on _average_ he's a full third of a hop closer."

- **C3 — The degree signal switches owner between Steps 18 and 19.** Step 18: "how many connections **they** have in the graph i.e **their** degree" reads as the _actor's own_ degree. Step 19 then measures "the average degree of their **top 50 costars**." Those are two different quantities, and hypothesis 2 (Step 13, "the _right_ people") is about costars being well-connected — i.e. costar degree. The antecedent of "they/their" in Step 18 is doing the wrong thing. Make Step 18 explicitly about _costars'_ degree so it lands on the same metric Step 19 plots.

- **C4 — The future model reads as film-count-only, undoing Steps 10–20.** You spend the whole analysis proving film count isn't enough (concurrency + costar degree matter). Then Steps 22–24 illustrate the projection purely through film count (De Niro's 72 vs Chevy Chase's 26; the chart is "career age vs # films"). A reader will conclude the who-wins simulation is film-count-driven — contradicting the point you just made. Your storyboard actually says the model spans "what films they appear in, **what happens to their concurrence, etc.**" — that clause got trimmed from Step 22. Restore it: state that films, concurrency and costar-degree are _all_ projected forward and re-run through the Step 20 model. (The film-count line is fine as the _illustration_, just flag it as one of several projected dimensions.)

- **C5 — "Gen Z's Kevin Bacon" after dethroning Kevin Bacon (Step 21).** Minor and probably deliberate (KB = the household name for "connected"), but you've spent 20 steps arguing he isn't the center, then call the next center "Gen Z's Kevin Bacon." A one-line wink ("ironically, the yardstick everyone knows") would defuse the apparent contradiction rather than leave the sharp reader snagging on it.

---

## 1. Clarity — is this the clearest way to show it?

- **L1 — State "lower = more central" before ranks appear (Step 4 → 5).** You define average distance in Step 4 but never say the direction. Step 5 jumps straight to "#175" and "#1." Add one clause: "the lower your average distance, the more central you are — so #1 is the _smallest_ number." Cheap, removes a real stumble.

- **L2 — The three scatters assert a correlation they don't actually show (Steps 10, 15, 19).** All three share X = log(films) and only swap the Y axis (avg*distance → concurrency → costar-degree). But the claims are about \_avg_distance* vs concurrency/degree — and avg*distance isn't on the axis in Steps 15/19. As drawn, the reader can't \_see* "low-avg-distance actors have low concurrency"; they have to remember it from Step 10. Fix: encode avg_distance as colour on all three plots (or persistently highlight the same benchmark actors across them), so the eye tracks the relationship instead of taking it on faith.

- **L3 — "top 75%" is ambiguous and undersells the point (Step 17).** "top 75%" reads as weak (you're better than only… the bottom 25%?) yet you mean it as impressive. Restate as a clean percentile: "better than X% of all actors." And since this number _is_ the motivation for "circular," pick framing that conveys the shock — one film, one costar, and you already beat actors with dozens of credits.

- **L4 — Define "proximity" (Step 24).** "similar actors based on proximity to them" — proximity in what space? Say it's proximity across the career stats you just built (films/concurrence/degree at the same career age). That single clause is what ties the Future section back to the model and reinforces C4's fix.

- **L5 — "correlation … at 82" needs units (Step 20).** Is that R² = 0.82? 82%? Also, the payoff of the entire analysis is the _improvement_ when concurrency + degree are added — see I6.

- **L6 — Pin down the vocabulary.** Same concept appears as **center** and **anchor** (Steps 10, 25, and the timeline comment); the metric is **concurrency** in body text but **concurrence** in your data/comments; and Step 20 says "**mean** average distance" where everywhere else it's "average distance" (which is already a mean). Pick one term for each and use it throughout — new-metric stories live or die on consistent naming.

- **L7 — Resolve all three quiz pairs, not one (Steps 13 → 14).** The quiz sets up three pairs (Theron/Rogen, Portman/Kendrick, Robbie/Franco) but only Theron/Rogen is explained in prose; the other two are only referenced collectively at Step 15. A reader who guessed on the other two never gets told if they were right. Even a one-line confirmation each closes the loop.

---

## 2. Additional insights that would hammer the point home

- **I1 — Quantify Julie Walters (Step 12).** "under-performs drastically" is currently qualitative. Give her rank and film count ("ranked #X despite Y films — more than [a top-20 actor]"). A number makes "drastically" hit; right now it's an assertion.

- **I2 — Show the spread when SLJ is crowned (Step 6).** You give #1 (2.09) and KB (#175, 2.28), but not the range. "Best 2.09 → typical actor ~X → worst Y" tells the reader how _compressed_ the elite is and therefore how big a 0.19 gap really is. Without it, 2.09 vs 2.28 looks like a rounding error.

- **I3 — Earn "first female center" on the timeline (Step 29 ← Step 9).** This is your closing payoff, but nothing in the piece establishes that _every_ past center (1970–2026) was a man. Make the Step 9 timeline visibly all-male (colour/label by gender) so "first female" reads as an observation the reader already made, not a claim dropped at the end.

- **I4 — Make the "5× longer reign" visible (Step 10 ← Step 9).** "His reign has lasted 5 times longer than anyone else" is a strong stat that the Step 9 timeline could show directly (reign-length bars/segments). Currently it's told, not shown, two steps after the timeline.

- **I5 — Ground "no clear majority" and "well-clear" with numbers (Steps 21, 25).** The three win-shares (25/10/10) sum to 45% — so 55% is a long tail. Showing _how many distinct actors won at least one sim_ is what makes "no clear majority" land (25% is actually dominant if 60 actors split the rest). And give CGM's _actual_ current avg_distance so "well-clear" is anchored — you quote Elle Fanning's 2.35 and Ariana's 2.57 but never CGM's own number.

- **I6 — The "82 → 9X" jump is the money stat of the whole analysis (Step 20).** You show dots moving toward the diagonal, but never state the _new_ correlation after adding both signals. That single before/after number is the quantified proof that "same films, different distance" is explained by concurrency + degree — it's the thesis of the entire Past/analysis section. Say it out loud.

---

## Copy / data nits (fast fixes)

- Step 2: "never will" → "never will **be**."
- Step 4: broken sentence — "connectivity how many movies on average is takes to get to them" → "connectivity **is** how many movies on average **it** takes to reach them."
- Step 15: `0.2` → `0.28` (see C1).
- Step 16: "and and."
- "Nicholas Cage" → "**Nicolas** Cage."
- "Chloë" (Step 21) vs "Chloe" (Step 25) — pick one.

---

## Technical aside — outside your three asks, but it breaks two steps

Steps `value === 28` and `value === 29` **never activate.** `Scrolly.svelte:40` sets `value = maxIndex`, the step's **DOM index** (0-based). You have 28 step `<div>`s, so indices run 0–27 — but the last two are labelled 28/29 (26 and 27 are skipped). Those two never match, so the closing beats ("winning score 2.24" and "first female center") stay pinned at `opacity: 0.3` and never highlight. Renumber the final two to 26/27, and confirm the skipped 26/27 weren't meant to be extra steps.
