# The finished-level mark (design)

Approved by the user in conversation on 2026-11-04. It follows the level
runs design (2026-11-01-runs-design.md). The question was: "Need a better
visual indication that a level has been completed."

## 1. What it shows

- A level counts as **finished** once any run of it has been finished, with
  all 20 problems answered. A run that ran out of lives doesn't count.
- On the level selector, a finished level's row shows a green **✓** and the
  **best time**, written as the finish screen writes it (m:ss.s), for
  example "✓ 1:12.4". It sits where the row's sample problem sits now, at the
  row's right, and replaces the sample.
- An unfinished level's row is unchanged and keeps its sample problem.
- The ✓ is in `--good`, the green of "New best". The time is in `--ink`, in
  the sample's size and weight. The mockup settles the exact spacing and ink
  alignment, following the sample's rules.

## 2. Where the best comes from

- For now, from the runs kept in this browser: `queue.best(n)`, the same
  number the finish screen compares against. A level with no kept finished
  run shows no mark.
- With part 2 (the API), runs leave the browser once they are stored, so the
  mark will take the best from mainframe instead (`GET /api/best`). That
  belongs to part 2's design, not this one.
- If storage is blocked or unreadable, no row shows a mark, and the game plays
  on as before.

## 3. When it updates

The marks are worked out whenever the selector appears: when the page loads,
after a run that ran out of lives, and after "Levels" on the finish screen.
So a run just finished shows its time as you come back.

## 4. Screen readers

A finished row's accessible name gains its result: "Level 1: Single-digit
addition. Finished, best 1:12.4." An unfinished row's name is unchanged:
"Level 1: Single-digit addition". The ✓ and the time themselves are hidden
from the accessibility tree, as the sample is.

## 5. Build

1. A mockup of the selector with the mark: Level 1 finished, Level 2 not;
   both finished; and a long time ("12:09.1"). Phone, desktop, sideways and
   320 wide. It goes through the UI agent check, then to the user.
2. The row's mark in `selector.js`, filled from the queue's best on each
   appearance, with unit and browser tests.
3. A UI gate against the approved mockup.

## 6. Out of scope

- Bests from mainframe (part 2).
- Seeing past results (the next design: "store and recall results").
- Any change to the finish screen.
