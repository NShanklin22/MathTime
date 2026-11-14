# The daily challenge

Decided 2026-11-14, in conversation. The user chose: a mixed 20 from Levels 1–4, one scored try a
day, a leaderboard afterwards, and a tile above the levels. The details below are the recommended
defaults. It builds on the accounts spec (2026-11-09-accounts-design.md) and the runs spec
(2026-11-01-runs-design.md).

## 1. The day's problems
- **20 problems, 5 from each of Levels 1–4** (Addition 1, Subtraction 1, Subtraction 2,
  Multiplication 1), shuffled, every one a different fact.
- **The same 20 for everyone that day.** They are drawn by a random generator seeded with the date
  (`YYYY-MM-DD`), so the browser makes them itself, offline too.
- **The day is the player's own calendar date**, as on Wordle. A new challenge starts at local midnight.
- **Each problem plays as its own level does:** its box, keypad and feedback. The answer box is sized for
  the widest answer among the day's 20, so it never resizes during the run.

## 2. Playing it
- Like a run: 3 lives a problem, the hidden clock, "Question N of 20" and the 20-segment bar. The
  breadcrumb reads "Levels › Daily challenge".
- **One scored try.** The first try that ends, finished or out, is the day's score.
  - **Finished:** the score is the total time.
  - **Out** (a third miss on one problem): the score is "Out at N of 20".
  - Leaving partway through (the "Levels" link or Esc) counts as out at that question, so the problems
    can't be previewed and then retried.
- Afterwards the tile offers **Practice**: the same 20 again, unscored, as often as you like.
- Signed out, the one try is kept by the browser only.

## 3. The tile
- A full-width tile at the top of the level selector, above the topic columns, in the tile style.
  - Before today's try it shows "Daily challenge" and the date, e.g. "Fri 14 Nov".
  - After the try it shows the score and the place, e.g. "1:04.2 · 3rd of 7".
- Tapping it, or Enter on it, starts the challenge before the try, and opens the board after it.
- It is free to everyone, signed in or not.

## 4. The board
- It is shown after the try ends, and from the tile. Its breadcrumb reads "Levels › Daily challenge".
- **Rows:**
  - Today's scores of everyone signed in, fastest first. Each row shows the place, name and time.
  - Outs come after all the times, ordered by how far they got.
  - Your row is marked as the current level's row is.
- **Below the rows:** Practice and Levels.
- **Signed out:** your score shows above the board, not in it, with "Log in to get on the board",
  which links to log in.
- **Offline:** your score, plus "The board will show when you're back online".

## 5. The API
- `POST /api/daily {date, record}` stores the signed-in player's first ended try for that date:
  - 201 when stored;
  - 409 when that player already has a score for the date, and the stored score is kept;
  - 400 for a malformed record, or a date more than a day from the server's date.
- `GET /api/daily/:date` returns that date's board: `[{name, totalMs | null, reached}]` with your
  row flagged. It needs no session, so anyone can see it.
- **Uploading:** the try goes in the same outbox as runs (accounts spec §5), owned by whoever was
  signed in when it ended. A try ended signed out is never put on the board, even after a log-in.
- The browser makes the problems, so a score is trusted as sent. The board is for invited friends.

## 6. Not in this piece
Streaks; past days' boards; sharing a result; a challenge for the higher levels.
