# MathTime Level 3: design

Approved by the user in conversation on 2026-11-04. Level 3 is the next step of
the roadmap (2026-10-21-roadmap-design.md, stage 1), as Level 2's spec planned
(2026-10-21-level2-design.md §6). Anything not stated here is as in Level 2's
spec, the runs spec (2026-11-01-runs-design.md) and the finished-mark spec
(2026-11-04-finished-mark-design.md).

## 1. The problems
- **Subtraction past 10:** `m − b`, where m is 10 to 18, b is 1 to 9 and the
  answer is at most 9. There are 45 facts, from 10 − 1 to 18 − 9. They are
  exactly the subtractions whose addition, in Level 1, crosses 10. Answers
  are 1 to 9.
- **Order of the facts:** by m, then by b: 10 − 1, 10 − 2, …, 10 − 9,
  11 − 2, …, 18 − 9.
- **A run** is 20 different facts, drawn as Level 2's are (runs spec §1), with
  3 lives a problem.
- **An answer is one digit long,** as in Level 2. The box is one digit wide.

## 2. The play screen
- As Level 2, with "−" as the operator. The one new thing is that the first
  number has two digits.
- Every alignment rule of Level 1 §6 applies to the two-digit number: its
  ink, the operator's gaps, and the fit on narrow screens, where the equation
  shrinks as it does now.
- Screen readers hear "Question N of 20: 13 minus 5".

## 3. The level selector
- **The row:** "Level 3", named "Subtraction past 10", with the sample "13 − 5".
  It sits under Level 2 in the Subtraction group. Once finished, it gets the
  check and best time like any row.
- **Rows in a group get a gap.** Today a group holds one row. With two, the
  rows' outlines would touch and a focused row's ring (2px, 4px out) would
  cover the next one. The gap is 12px, the finish buttons' gap, so a focus
  ring stays 6px clear. The mockup confirms it.

## 4. Build order
1. **Level 2's last four tasks** (plan 2026-10-31-level2.md, Tasks 5–8),
   brought up to date with the code as it is now. The roadmap strip is gone,
   and the runs, the finish screen and the finished mark are in. Level 3 rests
   on all four:
   - the selector on its ink (Task 5), now covering the finished mark too;
   - the way back: the "Levels" link and Esc (Task 6), with the restart fixes
     found since. `play()` resets the view, a stale queued `next()` can't skip
     a new run's first problem, `#status` is cleared on leaving, and the
     selector never leaves the game in the 'finished' phase;
   - the docs (Task 7);
   - the UI gate (Task 8).
2. **Level 3:** its data, the play screen, the selector's row and gap. A
   mockup goes through the UI check and then to the user before any of it is
   built. A UI gate checks the build against the mockup.

## 5. Not in this piece
- Mixed addition and subtraction, and multiplication (the next topic).
- Storing runs on mainframe and seeing past results (runs part 2, and the
  "store and recall results" design).
- Answers past 9 in subtraction.
