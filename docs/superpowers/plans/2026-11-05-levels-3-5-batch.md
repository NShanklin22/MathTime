# Levels 3–5: batch plan

Written 2026-11-05. The three levels finish the whole-number facts (roadmap stage 1). They are designed together and built on one branch, and they share one mockup and one UI gate. Every choice below is the recommended default. Level 3 keeps its own spec (2026-11-04-level3-design.md) and plan (2026-11-04-level3.md, Part 2).

## The levels

| Level | Topic | Problems | Facts | Answers | Sample |
|---|---|---|---|---|---|
| 3 | Subtraction past 10 | m − b, m 10–18, b 1–9, answer ≤ 9 | 45 | 1–9, one-digit box | 13 − 5 |
| 4 | Times tables | a × b, a and b 0–9 | 100 | 0–81, two-digit box | 6 × 7 |
| 5 | Division facts | (a·b) ÷ b, a 0–9, b 1–9 | 90 | 0–9, one-digit box | 56 ÷ 8 |

- The operators are "×" (U+00D7) and "÷" (U+00F7). Each is centred on the digit ink, like "+" and "−".
- A run is 20 different facts with 3 lives a problem, as now. Each fact is equally likely.
- On the selector, Level 4 goes in a new "Multiplication" group and Level 5 in a new "Division" group. Rows in the same group are 12px apart.
- Screen readers hear "times" and "divided by".

## Steps

1. **Mockup.** A single mockup holds the selector with all five rows, the play screen for each of Levels 3–5, and the finish screen. A UI reviewer agent checks it at 375px and desktop width, and anything it rejects is fixed. Then it goes to you for approval.
2. **Branch `levels-3-5`,** cut from main.
3. **Shared groundwork:**
   - two-digit first numbers fit on narrow screens (Level 3 plan, Task 6);
   - the 12px gap between rows in a group (Task 8);
   - the "×" and "÷" glyphs centred on the ink;
   - the selector's samples at 24px below 360px wide, so names never touch them (the mockup's rule).
4. **Level 3:** data, play screen and selector row (Level 3 plan, Task 7).
5. **Level 4:** the same, with the two-digit answer box.
6. **Level 5:** the same.
7. **Docs:** update the roadmap's "where we are".
8. **UI gate:** a reviewer agent compares the build with the mockup at every size.
9. **You approve,** then it is merged into main and pushed when you say.

Each of steps 3–6 is test-first. The full suite must pass, and the UI reviewer must approve each one's screenshots, before it is committed.

## Not in this batch
- Mixed operations.
- Answers past 9 in subtraction or division.
- The written methods (carrying and borrowing).
- Storing runs on mainframe and seeing past results.
