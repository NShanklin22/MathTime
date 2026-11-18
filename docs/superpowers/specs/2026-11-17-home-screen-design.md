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
Revised 2026-11-17 after the owner rejected the first mockup as ugly: same contents, laid out as a game's
title screen with one hero. The mockup (2026-11-17-home-mockup.html) is the record of the look.
- **The title**, "MathTime", set large with the answer box's amber caret after it. Home has no header;
  the settings gear sits at the right of the title's line.
- **Daily challenge** is the hero, the only box with a solid white frame. The date sits top right in
  every state.
  - Before today's try: a large sample sum in the play screen's digits and a solid white Start button.
  - After: the time very large, "✓ Done · 5th of 9 today", and an outlined "Full board ›" button.
  - Offline after the try: the same layout, with a dashed, dimmed "Full board · offline" in the button's place.
- **Next lesson** and **Levels** are second-level tiles with one shared anatomy: title and subtitle at top
  left, one figure at bottom right on a shared baseline, no chevrons.
  - Next lesson: the first unfinished level in level order (Levels 1–7 as built), with a sample problem;
    tapping starts it. Locked: the lock and "Log in" as the figure; tapping opens log in. With every level
    finished it reads "Last played", with the check and best time as the figure.
  - Levels: "Finished so far" and a big "4/7"; tapping opens the Levels screen.
- **Today's board** and **Progress** form one third-level section under a faint rule.
  - The board heading reads "Today's board · N played"; "Full board ›" sits there only before the try.
    Rows: the top three, then your own row (outlined) if you're lower. Empty: "No scores yet today".
    Offline: "The board will show when you're back online".
  - Progress: one row per topic, e.g. "Addition 1 of 2", a segmented bar counting built levels.

## 3. Layout
- Phones: one column: title, hero, the two tiles side by side, then board and progress.
- Wide windows: the hero with the two tiles stacked beside it, then board and progress side by side.
  A sideways phone uses three columns.
- One width rule that grows steadily with the window; type and controls scale with it. The title and
  hero hold their positions across states.
- Home and Settings fit without scrolling at every checked window, 320×640 and 844×390 included.
  Levels keeps its existing rule: one column scrolls on phones.

## 4. Settings
- A large "Settings" title in Home's column and scale, the breadcrumb on the column's edge.
- Signed in: "Logged in as nate" and a Log out button.
- Signed out: Log in and Sign up, opening the existing screens. After logging in you return to Home.
- "Log in" leaves the selector header; the lock on a level still opens log in.

## 5. Not in this piece
Themes, motion and other settings; streaks; past days' boards; per-level progress on Home.
