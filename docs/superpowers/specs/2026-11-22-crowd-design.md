# The crowd: a believable daily board

Replaces the ten made-up players (2026-11-18-fake-board-design.md). The user chose "realistic top ten".

## What the player sees

- The date line reads "10,101 played": 10,000, plus 100 for every account, plus the real players of the day.
- The board shows the day's best ten: the crowd's fastest (about 0:40–0:55) and any real player who beats them.
- A signed-in player not in the ten sees their own row after them, at its place among everyone: "1,240".
- Home's Daily row reads "1:58.3 · 1,240th of 10,101".

## Who the crowd is

- Made from the date and the number of accounts alone. Nothing is stored. Everyone sees the same crowd at the same moment.
- Size: 10,000 + 100 × accounts, at most 100,000. A new account adds 100 players to every day, each drawn after the earlier ones, so the earlier ones never change.
- 12% went out, at a question from 2 to 19, evenly spread.
- The rest finished. Their times follow a log-normal curve: median 2:30, spread σ = 0.39, never under 0:30. That puts:
  - the best of 10,000 at about 0:35–0:40, the tenth at about 0:45–0:50;
  - 2:00 near the top 30%, and 1:30 near the top 10%.
  The median is slow on purpose: a new player lands in a place that flatters but is still believable.
- Each player has their own handle, so a name stays with its player when someone faster joins the ten. Where two of the ten share a handle, the one made first keeps it; the other takes the next free one. A handle a real account holds is never used.

## Places

- A score's place: 1 + crowd scores strictly better + real scores strictly better. Equal scores share a place, and a real player is listed above a crowd one on a tie.
- Order is as before: finishers by time, then outs by question reached.

## Not in scope

- No crowd on a date past tomorrow (no one can have played it).
- No crowd for practice runs or levels.
- Tests turn the crowd off (createApp's `crowd: false`), so the older board tests stand as they were.
