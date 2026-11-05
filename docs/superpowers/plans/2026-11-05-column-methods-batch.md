# Levels 6–7: column methods batch plan

Written 2026-11-05. The first two written methods: carrying and borrowing. They share one new way of filling out a problem, the column board, so they are designed together, built on one branch, and share one mockup and one UI gate. Every choice below is the recommended default, taken from the exploratory mockups of 2026-10-21 (column addition and column subtraction). Long multiplication and long division come in the next batch, on top of this board.

## The levels

| Level | Topic group | Problems | Sample |
|---|---|---|---|
| 6 | Addition: column addition | ab + cd, both 10–99; half the problems carry in the ones | 47 + 38 |
| 7 | Subtraction: column subtraction | ab − cd, both 10–99, answer ≥ 0; half the problems borrow | 52 − 27 |

- A run is 20 different problems with 3 lives a problem, as now. Each problem's carry or borrow is drawn first (50/50), then the numbers, evenly.
- The numbers are set out in columns, the second number with its operator on the left, a sum line under them, and one answer cell per column (Level 1's one-digit box).
- **Work right to left, a column at a time.** Enter checks the current column. A right column locks and the cursor moves left; a wrong one shakes, costs a life and clears that column's cells.
- **Carrying (Level 6).** A dashed carry cell sits above every column but the ones, so it gives nothing away. In each column you type the digit, then the carry, or leave it empty. The last column's carry goes straight into the hundreds cell. Empty dashed cells are rubbed out once their column is right.
- **Borrowing (Level 7).** Tap the tens digit, or press Up: it is struck through, you write the new digit in a small cell above it, and a small 1 turns the ones digit into its teen. Then you write the ones answer.
- **The method is graded** (roadmap §2). A right digit with a missing or wrong carry or borrow is wrong.
- Keys: the digits, Backspace, Enter, the arrows (move inside the column), Up (borrow), Esc (back to the levels). Tapping a cell of the current column moves the cursor there. The keypad doesn't change.
- Colours: amber is the current cell, white is focus, as in the mockups.
- On the selector, Level 6 joins the Addition group and Level 7 the Subtraction group. Each row's sample is written on one line, like the others.
- Screen readers hear the column and the cell ("Ones, answer"; "Tens, carry"), and the result of each check.
- The finish screen, best time and stored runs are unchanged.

## Steps

1. **Mockup.** A single mockup holds the selector with all seven rows, Level 6 and Level 7 play screens (empty, mid-way, a wrong column, done), and the finish screen. It updates the 2026-10-21 explorations to today's app ("Question N of 20", the progress bar, no stage strip). A UI reviewer agent checks it at 375px, 320px, landscape and desktop width, and anything it rejects is fixed. Then it goes to you for approval.
2. **Branch `column-methods`,** cut from main.
3. **The column board** (shared): the grid of cells aligned on measured digit ink, the cursor and its moves, checking a column, locking it, the shake and the clearing. It is its own module (src/board.js) so long multiplication and division can reuse it.
4. **Level 6:** data, carry cells, play screen and selector row.
5. **Level 7:** data, the borrow (strike, small cell, small 1), play screen and selector row.
6. **Docs:** the roadmap's "where we are".
7. **UI gate:** a reviewer agent compares the build with the mockup at every size.
8. **You approve,** then it is merged into main and pushed when you say.

Each of steps 3–5 is test-first. The full suite must pass, and the UI reviewer must approve each one's screenshots, before it is committed.

## Not in this batch
- Three-digit numbers and more than one carry or borrow.
- Borrowing across a zero.
- Long multiplication and long division.
- Storing runs on mainframe and seeing past results.
