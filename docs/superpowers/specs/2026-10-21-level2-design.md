# MathTime Level 2: design

Decided 2026-10-21. Level 2 is the second step of the roadmap (2026-10-21-roadmap-design.md, stage 1). It builds on the Level 1 spec (2026-10-19-level1-design.md): everything not stated here is as there. Two mockups record the design, and both passed UI review:
- **`2026-10-21-level2-selector-mockup.html`:** the level selector. Layout A (the list) was chosen; B and C are kept for reference.
- **`2026-10-21-level2-play-mockup.html`:** the Level 2 play screen, built on the game's own code.

## 1. The problems
- Subtraction within 10: `a − b`, with a and b from 0 to 9 and b ≤ a. Answers are 0 to 9.
- Each of the 55 facts is equally likely, as each of Level 1's 100 is. (Picking a and then b would make "x − x = 0" more than a quarter of all problems.)
- An answer is one digit long. After one digit the box is full: the caret hides and further digits are ignored, as with two digits in Level 1.

## 2. The play screen
- The same as Level 1 (§3–§5), with the minus sign "−" (U+2212) as the operator. It is centred on the digit ink like "+".
- The answer box follows Level 1's rule: one fixed size for the level, wide enough for the widest answer, with equal padding on all four sides. For 0–9 that is one digit wide, so it is a little taller than it is wide (about 0.83).
- Lives, feedback and timing are as in Level 1 §2.
- Screen readers hear "Question N: 7 minus 3".

## 3. The level selector
This replaces Level 1's bare "Level 1" button (Level 1 spec §2 and §9).
- **When it shows:** the game opens on it. Running out of lives returns to it, with the level you came from marked. Choosing a level starts it at Question 1 with 3 lives, focus on the answer.
- **What it shows:** only the levels that exist, grouped by topic: Addition (Level 1), then Subtraction (Level 2).
- **Header:** the breadcrumb reads "Levels", with the roadmap strip below it. There are no hearts.
- **Column:** as wide as the keypad (420px including 16px sides), centred. On phones it spans the width less 16px gutters. The list starts 40px below the header.
- **Topic heading:** uppercase, 12px, weight 500, muted, letter spacing 0.1em. It sits 14px above its rows (ink to edge), with 32px between groups.
- **Level row:** a button 80px tall with the keypad's key outline (1.5px) and 24px padding.
  - Left: "Level N" (17px, weight 600) over the level's name (13px, muted), 10px apart.
  - Right: a sample problem (30px, weight 500), set like the equation, with muted operators centred on the digit ink.
  - Level 1 is "Single-digit addition", "3 + 4". Level 2 is "Subtraction within 10", "7 − 3".
- **Ink alignment:**
  - Text starts on its ink at the left padding edge.
  - Each sample's right ink sits on the right padding edge, so the samples line up across rows.
  - Both inner margins match.
  - The sample and the text block are each centred on their ink in the row.
- **The level you came from:** a 4px amber bar on the row's left edge. Nothing is marked when the game first opens.
- **States:**
  - Pressed: the key-press fill.
  - Keyboard focus: a 2px white outline, 4px out. Amber is reserved for "current".
  - The rows are buttons in the tab order.

## 4. The breadcrumb and the way back
- **The breadcrumb** reads "Levels › Topic › Level N": "Levels › Addition › Level 1" and "Levels › Subtraction › Level 2". It replaces "Arithmetic › Addition › Level 1" (Level 1 spec §3.1). The stage is still shown by the roadmap strip.
- **"Levels" is a link to the selector.**
  - It is muted, with a faint 1px underline running from its first ink to its last, 4px below the baseline; on hover the underline takes the text colour.
  - Its hit area runs from the top of the screen to 1px above the roadmap strip, and from the screen edge to 8px past the word. On phones that is 43px tall, all the room there is. It never covers the roadmap segments, which keep their tooltips.
- **Esc also goes to the selector** (ignored while an input method is composing). The link declares the shortcut to screen readers. Otherwise keys go to the answer as in Level 1, so the link is not a Tab stop.
- **When the header is tight**, the topic crumb drops first and "Levels" never drops. This replaces Level 1's drop-from-the-left rule. The first crumb's ink still starts at the header's edge.
- **Leaving mid-problem** abandons it. Coming back starts the level at Question 1.

## 5. Alignment and review
- Every row of Level 1 §6 applies to the Level 2 play screen, the "−" included.
- **On the selector, within 0.5px** (the 1× half-pixel floor of §6.2 applies):
  - the samples' operators on their digit ink;
  - the sample and text block centred in their row;
  - the two inner margins equal;
  - the samples' right ink lined up across rows;
  - the header's ink margins.
- The review process is Level 1 §8.

## 6. Not in this piece
- Subtraction facts past 10 (like 13 − 5). That is the next level.
- Saved progress. The selector forgets the level you came from when the page reloads.
- Locking levels, scores, sets of problems.
- The roadmap strip's 7 placeholder stages (roadmap spec §5).
- A visible hint for Esc, such as a tooltip.
- Mixed addition and subtraction.
