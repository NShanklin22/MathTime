# Animation ideas (brainstorm, 2026-11-06)

Three agents each took one angle and read the code: answer feedback, transitions, and working a problem. This is the merged, ranked shortlist. Nothing here is built.

## What the agents found first
- **No reduced-motion support** anywhere in styles.css.
- **About 11s of every 20-problem run is lost to a lock:** each right answer locks input for about 570ms (350ms green, then a 220ms slide out and in).
- **You can type into a box that is still sliding in.**
- **The shake and the slide move the work you're doing,** against the "nothing moves while you work" rule.

## Shortlist, ranked

| # | Idea | What happens | Time | Why |
|---|---|---|---|---|
| 1 | **In-place reprint** (next problem) | The green holds 150ms, the old ink fades out, the new problem fades in where it will sit. No slide. | ~210ms lock, not ~570ms | Saves ~7s a run, a crisp rhythm, and nothing to type into while it moves |
| 2 | **Inked over** (a column, or the whole answer, right) | A green pen line traces the answer box's frame, clockwise, then the digits turn green | 200ms, within the green | Feels like a draftsman inking over a pencilled box: sealed and owned |
| 3 | **Red-line** (wrong answer, replacing the shake) | A dashed warm-red line strikes through the wrong digits, holds, then they clear | 140 + 120ms | Calm and clear, and nothing moves |
| 4 | **Wet ink** (typing a digit) | The digit lands instantly with a soft ink bloom that dries away | 140ms, never blocks a key | Every key feels landed |
| 5 | **Pen-stroke run bar** | Each segment draws left to right as you finish; after the 20th, a sweep runs along the bar | 120ms | Progress is drawn, not switched on |
| 6 | **Rubbed out** (unused dashed cells) | The dashes shrink to dots and vanish when the column locks | 180ms | The scaffolding you didn't need is tidied away |
| 7 | **Fresh ink on the selector** | Back on the levels, the finished check draws itself. A new best strikes through the old time, then the new one appears | 240ms | It records what you just did |
| 8 | **Dimension line** (new best, finish screen) | A drafting dimension line draws under the time: "New best −2.4s" | 300ms | The improvement is measured, not just announced |

**Also floated:**
- a pen flick for the borrow (faster strike, the small 1 written top-down);
- a construction-line guide for a carry going up;
- the sheet swapping between screens while the grid stays put;
- ruling the grid on first load;
- hatching on running out of lives;
- a caret afterimage.

## Rules every idea follows
- Only opacity, colour, stroke-dashoffset or clip-path move; never position. Glyphs stay on their measured, snapped pixels.
- An effect never delays a key. The next key jumps it to its end state.
- Under `prefers-reduced-motion`, the end states show at once.

## Carries forward
Long multiplication rows lock with "inked over". Long division's bring-down uses a dashed guide instead of anything travelling.
