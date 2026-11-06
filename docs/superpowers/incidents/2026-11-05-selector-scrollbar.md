# Incident: the system scrollbar on the level selector

2026-11-05. Status: **corrective action approved by you on 2026-11-05; the fix is built on branch `selector-fit`** (section 4 records what was built and where it departs from section 3).

## 1. The problem

The game opens on the level selector. On a laptop, the list of levels is taller than the window, so the browser draws its own grey Windows scrollbar beside it (see the screenshot, 1366×768 laptop). It doesn't match the theme, and it is the first thing you see.

I measured the list's content height against the room it has, at each window size, with real scrollbars shown. A window size here is the screen's usable area inside the browser.

| Window (screen) | Levels 1–7 (live now) | Levels 1–5 (pushed this morning) |
|---|---|---|
| 1366×657 (1366×768 laptop) | scrolls: 854 in 605 | scrolls: 670 in 605 |
| 1280×610 (1920×1080 at 150%) | scrolls: 854 in 558 | scrolls: 670 in 558 |
| 1536×730 (1920×1080 at 125%) | scrolls: 854 in 678 | fits |
| 1440×790 (1440×900 laptop) | scrolls: 854 in 738 | fits |
| 1440×900 (our own test size) | scrolls by 6px: 854 in 848 | fits |
| 1920×950 (1920×1080 at 100%) | fits | fits |

- The play screens (Levels 1, 6 and 7) and the finish screen don't scroll at any of these sizes.
- The defect started with this morning's Levels 3–5 push, on small laptops. Today's Levels 6–7 push added two rows, so it now shows on almost every laptop.

## 2. How it got to production

Every check between the code and you was blind to scrollbars, and none of them used a real laptop window.

1. **Every screenshot hid scrollbars.** All screenshots in this project were taken in headless Chromium, which by default starts with `--hide-scrollbars`: the 656 browser tests, my mockup shots, and all five UI-review rounds this batch. The scrollbar never appeared in a single image any reviewer saw. That includes the approved mockup, which already had all seven rows and already scrolled at 1440×900.
2. **The desktop size we check isn't a laptop.** Desktop review and tests used a 1440×900 window. A real laptop browser window is 600–730px tall once the browser's own bars are taken off. Even at 1440×900 the list overflowed by 6px, invisibly.
3. **The warning was in front of me and I passed it on.** The Task B implementer reported "With seven rows, the selector now scrolls at 375×812." I treated that as expected and never looked at a desktop or laptop window. In the Levels 3–5 batch, the list was already known to scroll in landscape (a focus-ring fix); nobody asked what that scroll looks like with a mouse.
4. **No test says "this screen must not scroll."** The suite measures ink alignment to the device pixel, but nothing checked that a screen fits its window.
5. **I told you it was ready.** I asked you to merge and push on the strength of "passed code review and UI review, every test passes". That was true, and worthless on this point. You deployed what I reported as checked.

The fault is mine: the process I ran had no way to see this, and I didn't look myself.

## 3. Corrective action (proposed, nothing done yet)

### A. The fix
1. **The list fits without scrolling wherever there is width for it.** When one column of levels is taller than the window, the topic groups flow into as many columns as it takes to fit, side by side and centred. Groups are never split, and the order reads down each column, then across. At 1366×768, that is two columns: Addition and Subtraction, then Multiplication and Division. Screens where one column fits keep today's single column.
2. **Where it still can't fit** (phones, very short windows, and later as more levels are added), the list scrolls with a slim scrollbar in the theme's colours, never the system grey one.

### B. So it can't happen again
1. **Real scrollbars in every screenshot.** The test config and every screenshot script I or a subagent write launch Chromium without `--hide-scrollbars`. Every UI-review brief says so.
2. **Laptop sizes in every review and test matrix,** next to the current four:
   - 1366×657@1;
   - 1536×730@1.25;
   - 1280×610@1.5.
3. **A "fits its window" test for every screen** (the selector, each level's play screen, the finish screen) at those sizes. Nothing may scroll unless that screen's design says it can. Where it can, the scrollbar must be the themed one.
4. **Any report of a scroll or overflow stops the work.** I look at it myself at laptop and desktop sizes before it goes any further.
5. **Before I ask you to merge or push,** I send you the first screen at a laptop size, with scrollbars shown.
6. **Written down where it lasts:**
   - in this project's memory;
   - in your global CLAUDE.md, as one sentence under the UI-review rule ("screenshots show real scrollbars and include a 1366×768 laptop window"), since that rule covers every project.

On your "approved", I do A and B, test first. Each goes through the UI reviewer at all seven sizes, then I commit and report with two screenshots. Pushing waits for you.

## 4. As built

- **Columns.** n columns are allowed when their rows, n×388 + (n−1)×32, fit within the window less its two sides. Each side is the larger of the page gutter and that side's safe-area inset. The columns are centred, so the larger side counts on both edges. The list's own padding may run into the sides.
- **Padding gives way first.** Before the list scrolls, its top and bottom padding shrink by the same amount, on whole device pixels. The bottom stops at 6px (the focus ring's clearance, or the home-bar inset) and the top at 16px; then the other one takes the rest. A list whose rows all show never scrolls.
- **When nothing fits,** the fewest columns that give the shortest scroll are used.
- **Scrollbar.** At startup an unstyled probe checks whether the system's own scrollbar takes room. If it does (Windows, with a mouse or touch only), `html.scrollbars-take-room` is set, and Chromium draws the bar with `::-webkit-scrollbar`: 8px, square, with no arrow buttons, and stronger when hovered or dragged. Phones' overlay bars take no room, so they keep their own. Other browsers get `scrollbar-width: thin` and `scrollbar-color` from the theme.
- **Phone tests keep `--hide-scrollbars`.** Section 3's B.1 says otherwise; this is deliberate. Real phones draw overlay scrollbars that take no room, so hidden is closer to them than Windows' classic bars. The desktop project and every review screenshot show real scrollbars.
- **The fits test.** tests/e2e/fits.spec.js checks every screen at the laptop sizes for scrolling and clipping. Run against the code before the fix, it reports the defect exactly: 854 in 605, 678, 558 and 848.
- **Process (B.4–B.6),** outside the code:
  - in the project memory (feedback-real-scrollbars);
  - in your global CLAUDE.md, one sentence under the UI-review rule;
  - in the implementer rules and in every UI-review brief.
