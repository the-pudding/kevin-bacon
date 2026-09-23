# Matt's 9/21 feedback — triage

Open items only (already-implemented items from Matt's list removed: curly quotes,
nav tap zones, top-dot label, "169,000 actors" line, remoteness intro text,
search pool, give-up visibility, chart titles, future-label/x-axis).

Step numbers below are Matt's own numbering from the doc where he gave one
explicitly. Where he didn't name a step, it's marked "no step given" rather than
guessed — some of those are general/global asks, others are clear from context but
not tied to a specific step number in his text.

For each item, mark a decision: `skip`, `done`, or `do`.

## Copy/content

- [ ] 4. Title "Gen Z's Kevin Bacon" — still unclear, needs reword or cut
     Step: no step given (the title slide, before step 1)
     Matt doesn't think the title communicates what the piece is about. He suggested
     something more descriptive like "The 6 Degrees of Kevin Bacon, in 2050", or
     cutting the title slide entirely and opening straight on step 1.
- [ ] 7. "Centers of Hollywood" header — unchanged, still needs a clearer name
     Step: no step given (a chapter/section header, per Russell's comment it precedes the hop-graph steps)
     He wants a section header a reader can parse at a glance — his examples were
     "the Most-Connected Film Actor" or "The Real Kevin Bacon" — rather than "Centers
     of Hollywood", which he felt was jargon-y.
- [ ] 14. No distinct title typography ("The Four Degrees of Kevin Bacon" + subtitle)
      Step: no step given (same hop-graph chart block as items 8–13)
      He wants this title treated as a real display headline, not body text: its own
      typography, capitalized "The Four Degrees of Kevin Bacon", with a subtitle
      underneath — "All Hollywood actors are 4 movies away from Kevin Bacon".
- [ ] 16. "No one can be reached by everyone within 3" sentence — still there, Matt asked to cut it
      Step: 6 (explicit — "step 6 would get the last paragraph from step 5")
      He called this line "a doozy of a sentence" — too dense/negatively-phrased to
      parse on first read — and wanted it struck, with the surrounding copy reworked
      around the "X% of actors are four degrees from everyone" stat instead.
- [ ] 21. Still says "female" not "women" (copy line 469, 711, race.js:1150)
      Step: 8 (explicit)
      Style preference: use "women" rather than "female" throughout. He also suggested
      tightening the sentence to something like "All of the top 20 are men, with
      Nicole Kidman as the first woman at #21 with 2.19" to make the underrepresentation
      point directly.
- [ ] 30. "Remember, lower remoteness is better..." line — still present
      Step: no step given (falls in the block between step 8 and step 11, likely the race/rewind chart's Start-button step)
      He found this actively confusing because the axis is flipped (lower remoteness
      plots higher on the chart), so "lower" reads as "lower on the screen". He wants
      the line removed, and suggested the y-axis ends be labeled with meaning (e.g.
      "more connected" / "less connected") instead of relying on this caption.
- [ ] 35. Portman/Kendrick text — still "two extremes of the data," not the clarified rewrite
      Step: 15 (explicit)
      He felt "shown here at the two extremes of the data" doesn't say what's actually
      being compared. He wants it to state the comparison explicitly: they have
      different remoteness scores despite starring in the same number of films.
- [ ] 36/37. "50 most prolific costars" explainer not moved to tooltip; Portman/Kendrick dot-movement bug (step 18→19) unverified
      Step: 16/17 (combine-text ask) and 18/19 (tooltip + bug), both explicit
      Two asks bundled: (1) move the "an actor's 50 most prolific costars by number of
      films, taken as an average" definition out of the body copy and into a tooltip
      under "costar film count", so it doesn't clutter the narrative text; (2) he
      noticed Portman/Kendrick's dots didn't appear to move between step 18 and 19 as
      the y-axis metric changes, which reads as a bug worth confirming either way.
- [ ] 38. Quiz still gates forward nav — no skip
      Step: 20 (explicit)
      Several reviewers (Matt included) want the scatter-plot pair quiz to not be a
      hard gate — a reader should be able to move on without answering.
- [ ] 39. "he has a similar output..." — still ambiguous, not fixed to "Kevin Bacon"
      Step: 25 (explicit)
      The pronoun "he" is ambiguous between Chevy Chase (previous sentence's subject)
      and Kevin Bacon. Matt's fix: spell out "Kevin Bacon has a similar output..." so
      the antecedent is unambiguous.

## Visual/design

- [x] 3. done — NOT by swapping. Step 1 and step 2 now rest on one state
     (`networkIntro`, `lone` deleted): step 1 grows the constellation out of
     Bacon by hop layer — everyone one movie away as their six lines are drawn,
     then everyone two movies away as their twelve are — and then starts the
     route-highlight cycle that used to belong to step 2. Step 2 keeps the same
     picture with the cycle still running and only changes the words. Matt's
     underlying ask is met (step 1 is now the literal game) and the opening
     flight off the title card is kept, which a swap would have had to rebuild.
     Step: 1 and 2 (explicit)
     His words: "This first slide should just be the literal game — connecting
     Kevin Bacon to another actor. You do this on the next slide, so I'd switch the
     viz for step 1 and step 2. Step 1's viz, I think, works well for the idea that
     Kevin Bacon is in fact the 'center'." The copy stays where it is: step 1
     explains the game, so it should carry the constellation with the
     "X: two movies away from Bacon" routes that step 2 shows today; step 2 says
     "some sort of all-encompassing center of Hollywood", so it should carry the
     lone-Bacon camera fly-in that step 1 shows today.
     Not a pure reorder of the `<Step state=…>` attributes: `lone` owns the
     opening flight off the title card (`ownsArrival`), and `networkIntro` grows
     the constellation out of `lone`, so the entries have to be rebuilt in the new
     order — and the whole table stales.
- [x] 5. done — Pudding wordmark pinned to the top of the title card, byline
     ("By Owen Lacey", linking to the author page) added under the title (55ead98)
     Step: no step given (the title slide)
     He wants The Pudding's masthead (logo) and a byline visible somewhere near the
     top of the piece — standard outlet branding he expects on a published story.
- [x] 8. Dot delineation between hop layers — only a gap, not confirmed as circle-size shrink
     Step: no step given (the hop-graph chart, likely step 4 by comparison to his 9/8 feedback on the same chart, but not stated in the 9/21 doc)
     The hop-band rows currently read as one solid rectangle to him. His suggested
     fix was shrinking the circle size a bit so individual dots and the gaps between
     layers are more visually distinct.
- [ ] 9. Full-width chart usage — unverified
     Step: no step given (same hop-graph chart block as item 8)
     He wants the hop-graph chart to use the full available screen width rather than
     a constrained column, pointing to the NYT Chicago-police-complaints piece as a
     layout reference for how much space a chart like this can take.
- [ ] 10. CSS text-shadow on labels — not present
      Step: no step given (same hop-graph chart block as item 8)
      A specific multi-layer white `text-shadow` (pasted in his feedback) that he
      liked from the NYT reference piece, to keep dot labels legible when they sit on
      top of colored/busy backgrounds.
- [ ] 11. Label color matched to darker layer shade — not found
      Step: no step given (same hop-graph chart block as item 8)
      Rather than one label color for all layers, he wants each layer's text label
      tinted a darker shade of that layer's own color (e.g. `#610c18` for the red
      layer) so labels visually belong to their band.
- [ ] 12. Font swap to Atlas Grotesk 600 — not found (still mono)
      Step: no step given (same hop-graph chart block as item 8)
      He thinks the monospace font hurts legibility here and suggested switching to
      Atlas Grotesk at weight 600 for this chart's text.
- [ ] 22. Min 12px font for percentages — not verified
      Step: 8 (explicit)
      Accessibility/readability floor: percentage labels on the rank chart need to be
      at least 12px.
- [ ] 27. Axis tick marks/lines — not found
      Step: no step given (falls in the block between step 8 and step 11, likely the race chart)
      Axis labels currently look like they're floating with nothing to anchor them —
      he wants either small tick marks next to each label or a baseline/axis line so
      the labels visually attach to the chart.
- [ ] 28. Year format `'20` with curly apostrophe — still plain
      Step: no step given (same race-chart block as item 27)
      For year labels on the race chart, abbreviate the century with a left-facing
      curly apostrophe (e.g. "2020" → "'20"), which also helps once the timeline
      crosses the millennium boundary and gets confusing.
- [ ] 29. Line-label letter-spacing/font fix — not found
      Step: no step given (same race-chart block as item 27)
      If the race chart's right-side line labels are cramped for space, he suggested
      either switching to the narrower Atlas Grotesk or tightening letter-spacing to
      about -0.3px to make room.
- [ ] 31. Start button 48px sizing — not verified
      Step: no step given (same race-chart block as item 27, "note start button width/height")
      Same tap-target concern as the mobile button items below, called out
      specifically for the "Start" button on the race chart step.

## Interaction/a11y

- [ ] 23. "avg" text still low-contrast, not reworded
      Step: 8 (explicit)
      The "avg" label color fails contrast checks. His fix avoids a color change
      entirely: reword the text to fold "avg" into the sentence, e.g. "Samuel L.
      Jackson - 2.09 avg.", and bump what's left to `#333`.
- [ ] 24/25/26. Mobile tap targets (48px), 16px font, give-up contrast — not applied
      Step: 8 (explicit)
      Mobile usability/accessibility bundle: button text needs to be at least 16px
      (below that, iOS auto-zooms on focus), and every tappable target — buttons and
      the text-entry field — needs a minimum 48×48px hit area. The "give up" button
      specifically also needs its color bumped to `#333` to pass contrast.
- [ ] 32. Race year control still bits-ui Slider, not native `<input type="range">`
      Step: 11 (explicit)
      He wants the race chart's year scrubber rebuilt as a native `<input
type="range">` rather than the current bits-ui Slider component, referencing the
      Pudding's onion piece as a working example — the current control doesn't work
      properly for him on mobile.
