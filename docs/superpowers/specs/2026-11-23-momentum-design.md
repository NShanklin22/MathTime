# Momentum: a run that feels faster

The user asked for this on 2026-11-22. A run (and the daily challenge) should feel faster without fewer questions. They chose chunked progress with a pulse, and a streak that builds momentum as the questions go on. The defaults below are mine; the user can change any of them.

The mockup is `2026-11-23-momentum-mockup.html`. It is the real play screen, served by `scripts/serve.mjs`, with this design laid over it. It passed UI review.

## Where
Every run: the levels and the daily challenge alike, since they share the play screen and its bar. Practice is included.

## 1. Snappier swaps
- After a right answer, input is locked for 210ms, down from 320ms.
- Timings: trace 130ms, hold 150ms (the frame closed 20ms before the fade), fade out 60ms, fade in 90ms.
- That saves about 2s a run. The clock counts the swaps, so times get a little faster.

## 2. Four groups of five
- The 20-segment bar becomes four groups of five: 2px between segments, 8px between groups.
- The fifth right answer of a group fills its segment. Then the whole group flashes white and settles back (420ms):
  - the flash is #FFFFFF with a glow of 0 0 12px 3px rgba(255,255,255,.9);
  - only colour and glow change, and nothing moves.
- The 20th answer goes straight to the finish screen, with no flash. It waits the hold, as now, at the streak's pace.
- The extra gaps between groups are whole device pixels. On narrow bars the segments shrink to 12px below a 338px bar, to 10px below 298px, and to 9px below 258px (a 320px phone gets 10px).

## 3. Streak
- A streak counts right answers in a row since the last miss. A miss ends it, and the next right answer starts a new one at 1.
- From 3 in a row, the streak's own segments glow. Segments from before the streak stay plain green (#8FF0C0).

  | Streak | Fill | Glow |
  |---|---|---|
  | 3–5 | #6FF0AE | 0 0 4px 1px rgba(111,240,174,.6) |
  | 6–9 | #5CF7A6 | 0 0 7px 1px rgba(92,247,166,.65) |
  | 10+ | #3DFF8F | 0 0 12px 3px rgba(61,255,143,.85) |

- A miss cools the glowing segments back to plain green (200ms, as a segment fills).
- Momentum also shortens the lock:

  | Streak | Trace | Hold | Fade out | Fade in | Lock |
  |---|---|---|---|---|---|
  | 0–4 | 130ms | 150ms | 60ms | 90ms | 210ms |
  | 5–9 | 100ms | 120ms | 50ms | 80ms | 170ms |
  | 10+ | 80ms | 100ms | 40ms | 70ms | 140ms |

  The digits turn green 50ms before the trace ends.

## Reduced motion
- No flash. Colours change at once.
- The lock follows the same tiers. It is a pause, not motion.

## Screen readers
- Nothing new is announced. "Question N of 20" stays the only progress they hear.

## Known limitation
- The bar keeps its approved size and place (runs spec §2): segments 6px tall.
- At desktop sizes the first glow tier is subtle. The UI review accepted this.

## Not in scope
- No streak counter in text, no sound, and no change to scoring.
- Column levels use the same bar and timings. Their own step locks (board.js) take the same hold and fade-out values.
