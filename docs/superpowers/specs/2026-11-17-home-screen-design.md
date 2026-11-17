# The home screen

Decided 2026-11-17, in conversation. The user asked for a home screen in place of the daily tile and the
level columns sharing one page. Their choices: what the home screen holds (below), Settings with the
account only, progress as per-topic bars, the board as the top 3 plus your place, and Next lesson starting
the first unfinished level. The rest are the recommended defaults.

## 1. Screens
- **Home** is the first screen. It replaces the level selector as the game's opening screen.
- **Levels** is the existing selector, the topic columns only. The daily tile moves off it to Home.
- **Settings** is a new screen holding the account.
- Breadcrumbs start from the screen above:
  - Levels reads "Home › Levels"; a level reads "Levels › Subtraction 3", as now.
  - The daily challenge and its board read "Home › Daily challenge".
  - Settings reads "Home › Settings".
- Esc and the first breadcrumb link go up one screen. Finishing or leaving a level returns to Levels; a
  daily try or its board returns to Home.

## 2. What Home holds
- **The title**, "MathTime", in the header where the breadcrumb sits on other screens. A settings
  button (a gear) is at the header's right, where "Log in" sits now.
- **Daily challenge**, a big button:
  - before today's try it shows "Daily challenge" and the date, e.g. "Tue 17 Nov";
  - after the try it shows a green check (the finished-level check), the score and the place, e.g.
    "✓ 1:04.2 · 3rd of 7". Tapping it then opens the day's board, as the tile does now.
- **Next lesson**, a big button naming the first level, in level order (Levels 1–7 as built), that you haven't finished, e.g.
  "Next lesson · Subtraction 2". Tapping it starts that level. A locked one opens log in first, as on
  Levels, with "Log in to play" below the name. With every level finished the button reads "Last played"
  and names the last level played, with its check and best time.
- **Levels**, a big button opening the Levels screen.
- **Today's board**: the top three rows (place, name, time), then your own row if you're lower, marked as
  on the full board. Tapping it opens the full board. Before anyone has played, it reads "No scores yet
  today". Offline, "The board will show when you're back online". Signed out, the top three still show.
- **Progress**: one row per topic, e.g. "Addition 1 of 2" with a small bar filled by finished levels.
  The bars count levels that are built, not the roadmap's future ones.

## 3. Layout
- Portrait (phones): one column, in the order above, title at the top.
- Wide windows (≥688px, as the daily board's rule): two columns. Left: Daily challenge, Next lesson,
  Levels. Right: the board, then progress.
- Home and Settings fit without scrolling at every checked window down to 320×640; below that they may scroll inside
  the page, with the themed scrollbar. Levels keeps its existing rule: one column scrolls on phones.

## 4. Settings
- Signed in: "Logged in as nate" and a Log out button.
- Signed out: Log in and Sign up, opening the existing screens. After logging in you return to Home.
- "Log in" leaves the selector header; the lock on a level still opens log in.

## 5. Not in this piece
Themes, motion and other settings; streaks; past days' boards; per-level progress on Home.
