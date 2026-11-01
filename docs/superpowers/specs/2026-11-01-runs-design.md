# MathTime level runs: the end, progress, timing and records

Decided 2026-11-01. Until now a level never ended: problems kept coming until the third miss. This piece gives every level an end, shows how far through it you are, times each run, and keeps a record of every finished run on mainframe. It applies to Levels 1 and 2. Everything not stated here is as in the Level 1 spec (2026-10-19-level1-design.md) and the Level 2 spec (2026-10-21-level2-design.md).

The user chose each option below, in conversation, and asked for the recommended choice on the rest: where the key is typed, and the details in §4–§6.

## 1. A run
- **A run is 20 problems.** The number is stored on each level (`problemsPerRun`), so later levels can differ. Levels 1 and 2 both use 20.
- **No fact twice in a run.** The 20 are different facts, drawn at random from the level's facts (100 for Level 1, 55 for Level 2). Every fact is equally likely to be among them.
- **Lives:** 3 per problem, as now. A third miss ends the run *unfinished*: "Out of lives", then back to the selector, as now.
- **Leaving mid-run** (the "Levels" link or Esc, Level 2 spec §4) also ends it unfinished.
- **Unfinished runs** are neither timed nor recorded.

## 2. Progress
- "Question N" becomes **"Question N of 20"**.
- **A 20-segment bar.** One segment fills on each correct answer. It is the only progress mark: there is no percentage and no clock (§4).
- Screen readers hear "Question 4 of 20: 3 plus 4".
- Placement, size and colours are settled by a mockup that passes UI review (Level 1 spec §8) before any code. Two constraints hold:
  - Nothing moves during play except the segment that fills.
  - The equation keeps its size and alignment.

## 3. The finish screen
- After the 20th correct answer, once its green feedback ends, the play screen gives way to the finish screen.
- **It shows:**
  - "Level N complete";
  - **your time**, as m:ss.s;
  - **your best time** for the level, or "New best" when this run is faster than every earlier one (a tie is not a new best);
  - the number of misses.
- **Buttons:** "Again" (a new run of the same level, focused, also on Enter) and "Levels" (the selector, with this level marked).
- **Screen readers** hear "Level 1 complete. 1:12.4, new best."
- Its layout is settled by the same mockup and UI review as §2.

## 4. Timing
- **The clock is hidden** during a run.
- **Total time** runs from the moment Question 1 is shown to the 20th correct Enter. It includes feedback and slides, so every run counts them the same way.
- **Each problem's time** runs from the moment it is shown to its correct Enter. Misses on it count in its time.
- **Timer:** `performance.now()`. A run keeps counting if the page is hidden mid-run. That only makes a run slower, so it can never fake a best.

## 5. The record
Each finished run is one record:

| Field | Meaning |
|---|---|
| `id` | made in the browser (a UUID), so a retried upload is never stored twice |
| `level` | the level's number |
| `finishedAt` | when the run finished (ISO time, UTC) |
| `totalMs` | total time |
| `misses` | misses in the run |
| `problems` | 20 entries in the order asked: `a`, `b`, `ms`, `misses` |

Only the best time is shown for now. The full record is kept so that later pieces can show history or the slow facts.

## 6. Where records live
- **On mainframe:** a small API container, following the pattern of the other apps there:
  - Node in Docker, bound to `127.0.0.1:3006`;
  - SQLite in `~/apps/mathtime/data`;
  - backed up by `deploy.sh`.
  The port must be checked free first; RecipeLibrary uses 3005.
- **nginx** keeps serving the game as static files and passes `/api/` to the container.
- **The API:**
  - `POST /api/runs` stores a record. A known `id` is accepted again without being stored twice.
  - `GET /api/best` returns each level's best total time.
  - `GET /api/healthz`.
- **The key.** Every request sends a secret key (`Authorization: Bearer …`). It lives in mainframe's `.env`. Without the right key the API answers 401 and stores nothing.
- **Typing the key.** The first time a device finishes a run without a key, the finish screen shows "Save your times on this device", with a key field and Save.
  - "Again" keeps the focus. You reach the field with Tab or a tap, and Enter in the field saves.
  - The key is kept in that browser.
  - A wrong key shows "That key didn't work" and keeps the field.
- **Not losing runs:**
  - A finished run goes into a queue in the browser first, and leaves it only when the API has stored it.
  - The queue is sent again on the next page load and the next finish.
  - So a flaky connection (the home router's loopback, a train) loses nothing.
  - If Safari clears the browser's storage before an upload, the runs waiting in it are lost. The key is then typed again.
- **Best time when offline:** the finish screen uses the best from the last API answer, which the browser keeps, together with the runs still in the queue.
- The game plays the same with no key and no connection. Only saving needs them.

## 7. Building it
1. **First, the run and what you see:** §1–§3 and §4's clock. The mockup and UI review for the progress bar and the finish screen come before their code. Records are kept only in the browser queue.
2. **Then the API and the upload:** §5–§6, with the container, nginx and `deploy.sh` changes, and a README section for setting the key.
3. **Then Level 2's remaining tasks:** the selector's ink alignment, the way back, the docs and its UI gate (plan 2026-10-31-level2.md, Tasks 5–8). They follow this piece, so the way back is built knowing it ends a run.

## 8. Not in this piece
- Showing history, charts or slow facts.
- Unfinished runs in the record.
- A visible clock, or a toggle for one.
- Accounts, passkeys, more than one player.
- Editing or deleting records from the game.
- Locking levels behind a best time.
