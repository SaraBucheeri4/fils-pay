---
name: Playful Quest Fintech
colors:
  surface: '#fff7f9'
  surface-dim: '#fccbf4'
  surface-bright: '#fff7f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ffeff9'
  surface-container: '#ffe7f8'
  surface-container-high: '#ffdff7'
  surface-container-highest: '#ffd7f7'
  on-surface: '#2e0f2d'
  on-surface-variant: '#47454f'
  inverse-surface: '#462444'
  inverse-on-surface: '#ffebf8'
  outline: '#787680'
  outline-variant: '#c9c5d1'
  surface-tint: '#5d5792'
  primary: '#2e2860'
  on-primary: '#ffffff'
  primary-container: '#453f78'
  on-primary-container: '#b4adee'
  inverse-primary: '#c7bfff'
  secondary: '#3f6373'
  on-secondary: '#ffffff'
  secondary-container: '#bfe5f8'
  on-secondary-container: '#436877'
  tertiary: '#65601f'
  on-tertiary: '#ffffff'
  tertiary-container: '#b4ae64'
  on-tertiary-container: '#454100'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c7bfff'
  on-primary-fixed: '#19114a'
  on-primary-fixed-variant: '#453f78'
  secondary-fixed: '#c2e8fb'
  secondary-fixed-dim: '#a6ccde'
  on-secondary-fixed: '#001f29'
  on-secondary-fixed-variant: '#264b5a'
  tertiary-fixed: '#ede595'
  tertiary-fixed-dim: '#d0c97c'
  on-tertiary-fixed: '#1f1c00'
  on-tertiary-fixed-variant: '#4d4807'
  background: '#fff7f9'
  on-background: '#2e0f2d'
  surface-variant: '#ffd7f7'
typography:
  display-lg:
    fontFamily: Rubik
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Rubik
    fontSize: 34px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.01em
  headline-xl:
    fontFamily: Rubik
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-xl-mobile:
    fontFamily: Rubik
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: 0em
  headline-lg:
    fontFamily: Rubik
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-md:
    fontFamily: Rubik
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Rubik
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 18px
  label-lg:
    fontFamily: Rubik
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.03em
  label-md:
    fontFamily: Rubik
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Rubik
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system establishes a playful, 2D cartoon neobrutalist atmosphere tailored for a gamified financial application. It transforms everyday money tasks—budgeting, transfers, micro-savings, and ledger tracking—into engaging quest loops, rewarding milestones, and interactive adventures.

The aesthetic fuses bold graphic outlines with pillowy, tactile geometry. High-contrast midnight-violet contouring pairs with creamy paperboard backdrops and vibrant candy accents. The interface strikes a deliberate balance: energetic gamification structures (XP badges, streak meters, milestone banners) live harmoniously alongside crisp, trustworthy, and highly legible transaction data. The result is friendly and approachable while maintaining strict fiscal clarity.

## Colors

The palette employs vibrant, characterful inks grounded in vintage violet contours:

- **Primary (`#453f78`)**: French Blue serves as the core interactive engine—powering primary buttons, active nav pills, level progress bars, and key interactive markers.
- **Secondary (`#759aab`)**: Steel Blue acts as an atmospheric bridge for supporting badges, secondary surfaces, tags, and secondary action fills.
- **Tertiary (`#faf2a1`)**: Vanilla Custard functions as an expressive highlight fill, used on prize callouts, achievement banners, high-priority cards, and sunny accent moments.
- **Neutral / Structural Ink (`#401f3e`)**: Midnight Violet is the foundational outline and typography tone. Every card, button, and dynamic badge utilizes this ink for 2.5px to 3px solid borders and cartoon drop shadows, delivering unmistakable graphic presence.
- **Canvas (`#faf8ef` / `#fdfbf7`)**: Creamy warm surfaces deliver comfortable daylight reading without sterile starkness.

Text contrast against creamy backdrops relies on the Midnight Violet neutral ink, guaranteeing accessible legibility across financial dashboards and statement ledgers.

## Typography

The typographic pairing balances punchy cartoon warmth with analytical precision. 

- **Display & Headlines (`Rubik`)**: Features friendly geometric curves and soft stroke terminals that evoke casual comic and game title cards. Used in heavy weights (`700`, `800`) for account totals, XP tallies, achievement titles, and level headers.
- **Body & Data (`Plus Jakarta Sans`)**: Delivers supreme readability across high-density transaction tables, settlement terms, receipt breakdowns, and contextual instructions. Its open apertures and structured cadence keep numbers clear and legible.
- **Badges & Labels (`Rubik`)**: Uppercase and title-case labels leverage `Rubik` in bold weights to sustain a game-interface tone across coin badges, stat chips, and button labels.

## Layout & Spacing

The layout model runs on a modular fluid-responsive grid system designed for playful modularity.

- **Desktop (1024px+)**: A 12-column layout with 2rem outer canvas margins and 1.25rem gutters. Dashboard cards, mission hubs, and balance monitors snap into multi-column spans (4, 6, 8, or 12 columns).
- **Tablet (640px - 1023px)**: An 8-column layout with 1.5rem margins and 1rem gutters. Sidebar navigations collapse into a bottom action dock or top collapsible quest bar.
- **Mobile (< 640px)**: A 4-column layout with 1rem margins and 0.75rem gutters. Heavy cards reflow vertically with tactile finger-friendly touch targets (minimum 48px).

Vertical rhythm follows predictable multi-step chunks: components use `space-sm` (8px) and `space-md` (16px) for interior breathing room, while page sections transition using `space-lg` (24px) and `space-xl` (36px).

## Elevation & Depth

Visual hierarchy abandons diffuse realistic shadows in favor of a crisp, 2D cartoon neobrutalist elevation system. Depth is created through hard-edge ink outlines paired with offset solid cast shadows:

- **Level 0 (Flat / Inset)**: Crisp 2.5px solid border in Midnight Violet (`#401f3e`) without drop shadow. Used for secondary inputs, empty quest slots, and tabular data containers.
- **Level 1 (Card Rest)**: Crisp 2.5px border in `#401f3e` accompanied by a hard offset shadow: `3px 3px 0px #401f3e`. Standard treatment for transaction cards, stat tiles, and list containers.
- **Level 2 (Interactive Floating / Hero)**: Crisp 3px border in `#401f3e` paired with an amplified shadow: `5px 5px 0px #401f3e`. Applied to interactive buttons, level-up popouts, wallet balance cards, and claimable reward dialogs.
- **Level 3 (Pressed / Active)**: Upon press or click, the interactive element translates `+3px` along both X and Y axes, reducing the shadow to `0px 0px 0px #401f3e` or `1px 1px 0px #401f3e`. This produces a satisfying mechanical "clunk" reminiscent of a physical arcade push-button.

## Shapes

The shape system adopts a rounded level (`roundedness: 2`), yielding balanced radii:

- **Base Radius (`0.5rem` / 8px)**: Applied to input elements, tab segments, checkboxes, and inline badges.
- **Large Radius (`rounded-lg`, `1rem` / 16px)**: Applied to primary cards, modal overlays, quest banners, and action sheets.
- **Extra Large Radius (`rounded-xl`, `1.5rem` / 24px)**: Applied to hero balance widgets, reward chests, and standout announcement modules.
- **Pills / Full Radius (`9999px`)**: Reserved specifically for status pills, XP coin counters, category chips, and floating navigation docks.

All corner curves pair strictly with thick midnight-violet strokes, ensuring outlines hug curved corners without distortion or jagged seams.

## Components

### Buttons
- **Primary Button**: Background in French Blue (`#453f78`), text in Vanilla Custard (`#faf2a1`) or White, outlined with a 2.5px border in Midnight Violet (`#401f3e`). Elevated with a `4px 4px 0px #401f3e` hard shadow. Depresses to `0px 0px` on active press.
- **Secondary Button**: Background in Steel Blue (`#759aab`) or creamy canvas, text in `#401f3e`, 2.5px outline with matching hard shadow.
- **Reward / Action CTA**: Background in Vanilla Custard (`#faf2a1`), text in `#401f3e`, accented with animated cartoon hover wiggles or sparkle icons.

### Cards
- Surfaces sit on warm pastel backgrounds (`#fdfbf7` or `#faf8ef`) enveloped in 2.5px Midnight Violet outlines with standard `3px 3px 0px #401f3e` shadows.
- Header bands frequently feature solid contrasting fill strips (e.g., `#759aab` or `#faf2a1`) separated by internal 2px borders.

### Chips & Badges
- XP and category badges feature full pill shapes, bordered with 2px `#401f3e`.
- Coin chips display circular coin emblems alongside high-contrast numeral tallies in bold `Rubik`.

### Lists & Transaction Feed
- List items feature alternating surface tints or individual cardlets.
- Transaction items display category avatar icons enclosed in chunky rounded squares with 2px borders.
- Positive balances / cash inflows render with high-contrast badge accents, while outflows present clean, bold typography.

### Checkboxes & Radio Buttons
- 20px chunky boxes with a 2.5px `#401f3e` stroke and 6px border-radius.
- Active states fill with `#453f78` or `#faf2a1` featuring an oversized cartoon checkmark icon.

### Input Fields
- White or creamy surfaces framed by a 2.5px outline in Midnight Violet.
- Focus state reveals a vibrant `3px 3px 0px #453f78` hard offset ring without blurry glow rings.

### Progress & Level Meters
- Chunky capsule tracks bordered in `#401f3e`.
- Progress fill uses Vanilla Custard (`#faf2a1`) or French Blue (`#453f78`), segmented by clean comic tick marks indicating milestone unlocks.