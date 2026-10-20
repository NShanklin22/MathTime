# MathTime — Level 1 design

Date: 2026-10-19
Status: approved in conversation, awaiting written review
Visual reference: [2026-10-19-level1-mockup.html](2026-10-19-level1-mockup.html) (open in a browser; it is the verified prototype this spec describes)

## 1. Context

MathTime is a browser math game for one player, going from the absolute basics up to advanced physics. Physics is the end goal. The core value is the experience of working through a problem; that experience is what college never got right. The UI is therefore the product, and it is held to a very high bar.

Development goes **one piece at a time**: one level, one problem. This spec covers Level 1 only. Rules for later levels (feedback, lives, input) will change. They are deliberately not designed here.

## 2. Level 1 rules

| Rule | Decision |
|---|---|
| Problem | `a + b = ?`, with `a` and `b` random whole numbers from 0 to 9 |
| Possible answers | 0 to 18, typed as one or two digits (at most 2 characters) |
| Correct answer | The answer and box turn green. The problem slides out to the left and the next one slides in from the right. The question number goes up by 1. |
| Wrong answer | The equation shakes, the typed answer clears, and one life is lost. The same problem stays. |
| Lives | 3 per problem, refilled for every new problem |
| Out of lives | Go to the level selector |
| Level selector | Bare minimum: one "Level 1" button. Pressing it starts again at Question 1 with 3 lives. A real selector is a later piece. |
| Checking an empty box | Does nothing; no life is lost. |
| Timing | Green holds for 0.35s, then the slide out and in takes about 0.22s each way. The shake takes 0.32s. After the third miss, the selector appears 0.45s later. Input is ignored from a correct answer until the next problem is drawn (you can type as it slides in), and from the third miss until the selector appears. During a wrong-answer shake you can type again right away. |

## 3. Screen layout

The screen has three stacked bands that fill the viewport. The page never scrolls.

```
┌──────────────────────────────────────────┐
│ Arithmetic › Addition › Level 1    ♥ ♥ ♥ │  header
│ ▬ ▬ ▬ ▬ ▬ ▬ ▬                            │
│                                          │
│               Question 4                 │  problem area
│        7  +  5  =  ┌──────┐              │  (centred)
│                    │      │              │
│                    └──────┘              │
│                                          │
│          [ 1 ] [ 2 ] [ 3 ]               │
│          [ 4 ] [ 5 ] [ 6 ]               │  keypad
│          [ 7 ] [ 8 ] [ 9 ]               │
│          [ ⌫ ] [ 0 ] [ ✓ ]               │
└──────────────────────────────────────────┘
```

### 3.1 Header
- **Breadcrumb**, top left: `Arithmetic › Addition › Level 1`. The current step ("Level 1") is brighter and heavier.
- **Roadmap strip**, under the breadcrumb: 7 short segments for the 7 stages (Arithmetic, Fractions, Algebra, Geometry, Trigonometry, Calculus, Physics). The current stage is highlighted. Each segment has its stage name as a tooltip, and the strip has an accessible label.
- **Lives**, top right: 3 hearts. A lost life shows as a dashed outline heart. Lives are lost right to left. The hearts are centred vertically on the breadcrumb's text line, and the hearts' right ink edge sits the same distance from the screen edge as the breadcrumb's left ink edge.
- The header must stay on one line. When space runs out, crumbs drop from the left: first "Arithmetic ›", then "Addition ›". The roadmap strip still shows the stage.

### 3.2 Problem area
- The equation `a + b = [box]` is big and centred, both horizontally and vertically, between the header and the keypad. Horizontal centring is of what you see: from the first digit's ink to the box's dashed outline.
- The space between neighbours is even: the ink gap from "=" to the box's outer edge matches the ink gaps between the other symbols.
- If the problem area is still short (§3.4 covers phones held sideways), the equation shrinks until "Question N" and the box both fit inside it with at least 8px to spare above and below. When the area is too short even for that (under about 49px), the 8px shrinks first, together with the font (§6.2).
- "Question N" sits centred above the equation, in a smaller muted style.
- The answer is typed **inside the box, inline after "="**. There is no separate input field.

### 3.3 Keypad
- A 3×4 grid: `1 2 3 / 4 5 6 / 7 8 9 / ⌫ 0 ✓`, centred, at most 420px wide, pinned to the bottom.
- It is the main input on every device and **is critical for later levels**, which will need more symbols. The phone's own keyboard is suppressed.
- A physical keyboard also works (digits, Backspace, Enter). Each accepted key press flashes the matching on-screen key. Keys that are ignored (a third digit, Enter on an empty box, input during an animation) do not flash.
- Focus always stays on the answer. Tapping anywhere, including the keypad, never steals it.

### 3.4 Landscape (wide, short screens)
When the screen is in landscape, at most 560px tall and at least 3:2 (a phone held sideways), the stacked layout leaves too little height for the problem. The screen then splits into two columns under the full-width header. (A nearly square window keeps the stacked layout: beside the keypad the equation would be a sliver.)
- **Left:** the problem area, at the full height below the header. The equation is centred and fitted in it by the same rules as portrait.
- **Right:** the keypad, the same 3×4 grid, with its rows sharing the full height below the header. Keys are 40–64px tall (on a screen under 264px tall they shrink further rather than run into the header), 1.5 times as wide as they are tall. The keypad's right edge and bottom keep the 16px gutter. When the keys reach 64px, the keypad is centred vertically in its column, on the same line as the problem area's centre.
- The header, the problem area and the keypad keep clear of notches and the home bar (safe-area insets).
- Nothing else changes: the same theme, the same alignment rules (§6), the same flows.

## 4. The answer box

- **One fixed size for the whole level.** It is wide enough for the widest possible answer (0–18), with the **same padding on all four sides**. It never resizes and never hints at how many digits the answer has.
- The border sits outside the padding, so the padding stays equal whatever the border width.
- Every typed answer is **ink-centred** in the box: centred on the actual drawn shape of the digits, not on the font's character boxes. (A narrow "1" would otherwise look lopsided.)
- The caret is custom:
  - one vertical bar exactly as tall as the digit ink;
  - centred when the box is empty;
  - a fixed small gap after the last digit's ink when the box holds one digit;
  - hidden when the box is full (2 digits) and while the answer shows as correct.
- A wrong entry wider than the box (such as "44") is scaled down around its centre so it never touches the border.
- Nothing else on screen moves while you type.

## 5. Visual theme: Blueprint

An engineering-drawing look: white line work on blueprint-blue grid paper. It points toward the physics at the end of the road.

### 5.1 Colour

| Role | Value |
|---|---|
| Background | `#12407e` |
| Grid | 1px lines every 20px at white 6% opacity, and every 100px at white 14% opacity |
| Ink (digits, current crumb) | `#eef5ff` |
| Muted (operators, other crumbs, question label) | `#b6cdee` |
| Answer box line | `#eef5ff`, 2px or 0.025em (whichever is larger), square corners |
| Construction outline | 1px dashed, ink colour (`#eef5ff`) at 55% opacity, offset 5px or 0.06em (whichever is larger) outside the box |
| Caret, current roadmap segment | amber `#ffd66b` |
| Upcoming roadmap segments | `#6f95cc` (3:1 against the background) |
| Correct | `#8ff0c0` (answer digits and box line) |
| Hearts | `#eef5ff` solid; a lost heart is a dashed `#8fb0dd` outline |
| Keys | Transparent, 1.5px inset outline in the ink colour (`#eef5ff`) at 80% opacity, square corners. Pressed: white 12% fill. |
| Check key | Solid `#eef5ff` with a `#12407e` icon. Pressed: `#cfe0f7`. |

The amber caret matters. In this font, a white "1" next to a white caret reads as "11"; the colour difference prevents that.

### 5.2 Type
- **IBM Plex Mono** for everything: numbers and keys at weight 500, current crumb at 600, other crumbs at 400.
- **IBM Plex Sans** (same family) is the fallback, so Greek letters (θ, ω, Δ, λ, μ) come out in matching type when physics arrives. Plex Mono has no Greek. This was checked against every candidate font, and none of them had Greek.
- Plex Mono was chosen for its dotted zero (never confused with O), its footed "1" (never confused with l, I or the caret), and its even digit widths.
- Fonts load from Google Fonts before the problem is first drawn, so text never jumps after it appears.

### 5.3 Sizing
- Equation font size is `clamp(40px, min(17vw, 15dvh), 128px)`. It shrinks further when the full equation, including the box's construction outline, does not fit between the side gutters.
- Side gutters are at least 16px on phones, upright (≤480px wide) or sideways (§3.4), and 24px elsewhere.
- Keys are 48–64px tall in the stacked layout, depending on screen height; 40–64px beside the problem (§3.4).

## 6. Alignment requirements (the quality bar)

Every point below was measured in real rendered pixels at 375×812 (pixel ratio 2) and 1440×900 (pixel ratio 1), and passes in the mockup.

| Requirement | Target |
|---|---|
| Box vertical centre vs digit ink centre | ≤ 0.5px |
| "+" and "=" vertical centre vs digit ink centre | ≤ 0.5px |
| Answer baseline vs problem baseline | 0px |
| Caret top and bottom vs digit ink | Reaches the ink at both ends, never short |
| Answer horizontal centring (every answer 0–18) | ≤ 0.5px |
| Box padding, widest answer | Equal on all four sides, within about 0.5px. Left and right are measured from the answer's ink; top and bottom from the ink band of all ten digits, since the box must fit every digit. Flat-topped answers like "14" therefore sit about 1 device pixel inside that band. |
| Keypad digit labels vs key centre (ink) | ≤ 0.5px both ways |
| Equation position while typing or after a wrong answer | 0px movement |
| Gutters | ≥ 16px phone, ≥ 24px desktop, overhangs included; no horizontal scroll |
| Visible group (first digit ink to box outline) horizontal centre vs problem-area centre | ≤ 0.5px, for every problem |
| Ink gap "=" → box vs mean of the other ink gaps | ≤ 0.5px |
| Hearts centre vs breadcrumb text centre | ≤ 0.5px |
| Header ink margins, left vs right | ≤ 0.5px apart |
| "Question N" and box inside the problem area | ≥ 8px clear above and below when the area allows; otherwise the clearance shrinks before the font (§6.2) |

### 6.1 How the mockup achieves it (keep these techniques)
Browsers position text by its character box, not by its ink, and fonts differ a lot. So alignment is measured, not assumed:

1. **Pixel-scan measurement.** Each string is drawn on an offscreen canvas at its real on-screen size in device pixels, so hinting matches what is actually drawn. Its ink edges are found from the alpha channel, with edge-pixel coverage giving sub-pixel precision. The browser's own `measureText` is not used for ink, because its bounds are rounded.
2. **Baseline from the live layout.** The baseline is read from an invisible probe element, not computed from font metrics.
3. **Box, caret and operators** are all placed from the measured digit ink. The box width is measured from the widest real answer.
4. **Snap to device pixels.** The equation is nudged so its baseline and left edge land on whole device pixels. The caret is snapped outward so it always reaches the ink.
5. **Keypad labels** are measured at their own size, since small text snaps to pixels differently, and are moved by whole device pixels onto the key centre.
6. **Re-measure** whenever the problem area resizes or a font finishes loading.

### 6.2 Known limits
- A half-pixel at 1× screens is the floor for some measurements. The browser places text on whole pixels, so 0.5px is the best a centred position can do there.
- Windows adds faint colour fringes to small text (ClearType). A web page cannot turn this off.
- Not yet checked on a real 3× pixel-ratio phone. Layout positions are checked in real desktop windows at 3×, 2.625× and 1.5×; an emulated ratio lays out on a coarser grid (1/64 CSS px), where those device pixels don't exist.
- A problem area under about 49px tall can't keep 8px clear with a readable equation, because the box's border (2px) and outline (5px out, 1px wide) don't shrink with the font. There the clearance and those px minimums shrink with the font instead, all together, so the whole group still fits and the font grows steadily with the area. Under about 3px nothing fits, and the layout is left as it is.

## 7. Accessibility
- Lives are announced as "3 lives left", "2 lives left", "1 life left".
- The roadmap strip has a text label naming all 7 stages.
- The delete and check keys have labels ("Delete", "Check answer").
- Text contrast is at least 4.5:1 and UI lines are at least 3:1 against the background. The exception is the keys' surface: their labels identify them, by design.

## 8. Review process (applies to every UI change)
No screen is shown to the player-designer until a separate review agent has rendered it and measured it against section 6. The checks run at 375×812 (pixel ratio 2) and 1440×900 (pixel ratio 1) at minimum, and every flow is exercised (correct, wrong, out of lives, restart). Defects are fixed and re-checked first.

## 9. Not in this piece
These are deliberately left for later pieces:
- other levels
- a real level selector
- sets of problems
- scoring and streaks
- saved progress
- learn-then-practice explanations
- timed drills
- worked multi-step problems
- physics notation and units
- sound
- hosting

The mockup also contains the 8 rejected themes and the alternative fonts, via `?theme=` and `?font=`, purely for reference. Only Blueprint with IBM Plex is part of this design.

## 10. Open question for the implementation plan
- **Build approach:** plain HTML, CSS and JavaScript (as in the mockup) or a framework. Decide when writing the implementation plan.
