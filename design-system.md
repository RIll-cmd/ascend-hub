---
primary: "#fea480"
secondary: "#a4805c"
accent: "#ffe2b7"
neutral: "#f4f1ff"
background: "#0c0805"
white: "#ffffff"
---

# WorkOS — Style Reference
> A high-fidelity terminal interface forged in obsidian and copper. The canvas is a deep, light-absorbing void where glowing amber accents and crisp technical type create the atmosphere of a mission-critical command center.

**Website URL:** https://workos.com/launch-week/summer-2026
**Theme:** dark

The visual language is defined by a sophisticated "Technical Noir" aesthetic. It utilizes a pitch-black and deep espresso canvas (#0c0805) as the foundation for high-contrast typography in Lavender White (#f4f1ff). The color palette is anchored by warm, metallic tones—specifically a glowing Peach Primary (#fea480) and a muted Bronze Secondary (#a4805c). Shape language is predominantly sharp and rectangular, favoring 0px radii for a brutalist, modular feel, punctuated by rare, extreme pill-shaped elements. Typography is a rigorous mix of Swiss neo-grotesque and retro-digital monospaced faces, creating a hierarchy that feels both timelessly engineered and urgently modern.

## Tokens — Colors

| Name | Value | Token | Role |
| :--- | :--- | :--- | :--- |
| Obsidian | #000000 | `color-black` | The absolute void. Used for primary canvas backgrounds and deep layering to ensure maximum contrast for text. |
| Espresso | #0c0805 | `color-background` | A warm, dark neutral used for section backgrounds to provide subtle depth separation from the absolute black canvas. |
| Lavender White | #f4f1ff | `color-primary` | The primary text color. A high-brightness neutral with a hint of violet to prevent optical fatigue on dark backgrounds. |
| Peach Glow | #fea480 | `color-accent` | The primary action color. Used for critical highlights, borders, and primary interactive states to draw immediate focus. |
| Bronze | #a4805c | `color-secondary` | A muted metallic used for secondary text, footers, and less critical UI borders to establish a sophisticated hierarchy. |
| Champagne | #ffe2b7 | `color-accent-light` | A soft, warm highlight color used for specialized text spans and high-contrast decorative elements. |
| Coffee | #3a3129 | `color-neutral-dark` | A low-contrast neutral used for subtle borders and tertiary text that recedes into the background. |
| White | #ffffff | `color-white` | White (#ffffff) — text on filled buttons, canvas. Never used as a standalone surface color. |

## Tokens — Typography

### SuisseIntl — Primary Interface. · `font-sans`
- **Substitute:** Inter, Manrope, Helvetica Now
- **Weights:** 400 (Regular), 500 (Medium)
- **Sizes:** 11.2px, 14px, 16px, 23.52px, 28px, 36px, 48px, 72px
- **Line height:** 14px to 24px (1.0 to 1.5)
- **Letter spacing:** Normal to -0.05em
- **OpenType features:** Default
- **Role:** The workhorse of the system. It handles everything from massive display headlines to functional body copy. The typeface is set with tight tracking in larger sizes to emphasize its architectural, Swiss-engineered precision.

### digital7Mono — Technical Data. · `font-digital-7`
- **Substitute:** JetBrains Mono, Roboto Mono
- **Weights:** 400
- **Sizes:** 17.2px, 23.52px
- **Line height:** 17.2px to 23.5px
- **Letter spacing:** 3.1px (0.18em)
- **OpenType features:** Default
- **Role:** Used exclusively for data readouts, timestamps, and "live" status indicators. The wide letter spacing and monospaced rhythm evoke vintage hardware displays and terminal outputs.

### vt323 — Terminal Aesthetic. · `font-mono`
- **Substitute:** Courier, Fira Code
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 24px
- **Letter spacing:** Normal
- **OpenType features:** Default
- **Role:** A secondary monospace used for low-level technical details and code-like snippets, reinforcing the developer-centric nature of the brand.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
| :--- | :--- | :--- | :--- | :--- |
| Display | 72px | 72px | -0.05em | `text-7xl` |
| Heading-lg | 36px | 36px | -0.025em | `text-5xl` |
| Subheading | 23.52px | 23.52px | normal | `text-2xl` |
| Body | 16px | 24px | normal | `text-base` |
| Body-sm | 14px | 14px | normal | `text-sm` |
| Caption | 11.2px | 11.2px | 1.344px | `text-xs` |

## Tokens — Spacing & Shapes

**Density:** compact

### Spacing Scale

| Name | Value | Token | Description |
| :--- | :--- | :--- | :--- |
| xs | 4px | `spacing-1` | Micro-spacing for fine adjustments and tight icon/text gaps. |
| sm | 7px | `spacing-7px` | Small internal padding for badges and inline elements. |
| md | 20px | `spacing-5` | Standard gap for flex layouts and component internal padding. |
| lg | 40px | `spacing-10` | Header padding and larger structural gaps. |
| xl | 80px | `spacing-20` | Section margins and footer vertical padding. |

### Border Radius

| Element | Value |
| :--- | :--- |
| Cards | 0px |
| Buttons | 0px |
| Inputs | 6px |
| Modals | 0px |
| Pills | 999px |

### Layout
- **Page max-width:** 1150px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

## Components

### Primary CTA Button
**Role:** Main Action
A sharp, rectangular button with no border-radius. Features a background of #fea480 (Peach Glow) with #000000 text. Padding is typically 0px vertically as it relies on fixed heights or flex centering. Typography is SuisseIntl 16px Medium. Transitions use a 0.2s ease-out on background-color.

### Technical Badge
**Role:** Status Indicator
A pill-shaped element (999px radius) with a background of #0c0805 and a 1px border of #3a3129. Text is set in digital7Mono at 17.2px with a color of #dcdad6. Features a distinct 3.1px letter spacing to emphasize the digital readout aesthetic.

### Feature Card
**Role:** Content Container
A brutalist container with 0px border-radius and a 1px border of #3a3129. The background is a subtle gradient (gradient-5) transitioning from #3d3934 to #191919. Internal padding is 20px. Headlines inside use SuisseIntl 23.52px in #f4f1ff.

### Architectural Cabinet Cubby
**Role:** Workstation Compartment / Display Bay
- **Dimensions:** Standard cubbies (280px × 340px), Tall Center Bay (560px × 696px).
- **Outer Border:** 7px solid `#23160e` (Walnut Border).
- **Top Chamfer:** 3px solid `#523722` (Bevel Highlight reflecting top ambient ceiling light).
- **Bottom Bevel:** 5px solid `#090604` (Deep contact shadow).
- **Back Wall Material:** Vertical wood gradient `linear-gradient(180deg, #18110b 0%, #100a06 55%, #0c0805 100%)`.
- **Subtle Wood Grain:** `repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 18px)`.
- **Multi-directional Cavity Shadow:**
  ```css
  box-shadow: 
    inset 0 16px 32px rgba(0,0,0,0.92),
    inset 0 -16px 32px rgba(0,0,0,0.92),
    inset 14px 0 24px rgba(0,0,0,0.8),
    inset -14px 0 24px rgba(0,0,0,0.8),
    0 12px 30px rgba(0,0,0,0.9);
  ```

### Overhead Linear LED Strip Light
**Role:** Downward Illumination Fixture
Mounted flush to the interior ceiling of each cubby cell.
1. **Emitter Rail (`.cubby-led-bar`):**
   - **Dimensions:** `height: 3px; top: 0; left: 12px; right: 12px; border-radius: 2px;`
   - **Gradient Core:** `linear-gradient(90deg, transparent 2%, #ffe2b7 20%, #ffffff 50%, #ffe2b7 80%, transparent 98%)`
   - **Multi-tier Glow:** `box-shadow: 0 0 10px #fea480, 0 1px 18px #fea480, 0 4px 28px #a4805c;`
2. **Downward Light Wash (`.cubby-led-wash`):**
   - **Coverage:** `top: 0; left: -10%; right: -10%; height: 100%; pointer-events: none;`
   - **Radial Falloff:** `radial-gradient(ellipse at 50% 0%, rgba(254, 164, 128, 0.48) 0%, rgba(164, 128, 92, 0.22) 38%, rgba(12, 8, 5, 0) 78%)`
   - **Dynamic Control:** Controlled via CSS opacity (0.0 to 1.0) or CSS variable `--led-intensity`.

### Framed Centerpiece Poster
**Role:** Hero Focus Element
A matte black aluminum gallery frame suspended within the central tall cubby bay.
- **Dimensions:** 82% width × 86% height of central cubby bay.
- **Frame Border:** 10px solid `#14100c` with 1px outer outline `#3d281a`.
- **Drop Shadow:** `0 16px 40px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.05)`.
- **Artwork Background:** High-resolution cosmic nebula/gas giant vortex with lone astronaut standing on space station tower (`/hail-mary-poster.jpg`).
- **Typography Hierarchy:**
  - Tagline: "EVERY ENVIRONMENT TELLS A DIFFERENT STORY" — SuisseIntl 8.5px, weight 500, letter-spacing 2px, `#ffe2b7`.
  - Title: "PROJECTS" — SuisseIntl 25px, weight 800, letter-spacing 5px, `#f4f1ff`.
  - Subtitle: "HAIL MARY" — SuisseIntl 12px, weight 500, letter-spacing 4px, `#fea480`.
  - Description: "MANAGE DEVELOPMENT, STAGING, AND PRODUCTION UNDER ONE PROJECT, WITH UNIQUE BRANDING FOR EACH." — SuisseIntl 7.5px, line-height 1.6, `#cbb497`.
  - Bottom Partner Glyphs: `П ◇ ▲ ◎ ◈ ⏣ ▼ H` — vt323 / monospace 7px, letter-spacing 2px, `#887153`.

### Interactive Shelf Props
**Role:** Tangible Artifacts
Each cubby houses a physical collectible with dual-state illumination:
1. **Science Kit (Top-Left):** Microscope and chemical lab glassware (`science-kit-off.avif` / `science-kit-on.avif`).
2. **3D Printer (Bottom-Left):** Rapid prototyping machine with geometric polyhedron (`3d-printer-off.avif` / `3d-printer-on.avif`).
3. **iMac Classic (Top-Right):** Bonded CRT computer with astronaut figurine and active "Error 404" system dialog (`imac-on.avif`).
4. **Model Ship (Bottom-Right):** Project Hail Mary modular rocket probe with solar wings on display stand (`ship-off.avif` / `ship-on.avif`).
- **Hover Micro-interaction:** 0.25s crossfade between unlit state and glowing neon active state.
- **Drop Shadow:** `filter: drop-shadow(0 12px 20px rgba(0,0,0,0.85))`.

### Footer
**Role:** Navigation & Credits
A spacious section with 80px bottom padding. Text is primarily #a4805c (Bronze) at 16px. Links transition to #f4f1ff on hover. Layout is a 4-column grid with 19.6px gaps.

## Do's and Don'ts

### Do
- Use absolute black (#000000) for the primary page background.
- Maintain sharp 0px corners for all primary structural containers and buttons.
- Use digital7Mono for any numerical data or timestamps.
- Apply tight tracking (-0.05em) to display headlines above 48px.
- Use #fea480 as the primary accent for interactive highlights.
- Ensure all text meets AAA contrast ratios against the dark canvas.
- Use 20px (spacing-5) as the default gap for flex layouts.
- Always include the top highlight chamfer (`#523722`) on cabinet borders to simulate ceiling ambient bounce.

### Don't
- Never use soft blurry shadows for UI cards; depth is achieved through color contrast and crisp borders.
- Do not use border-radius on buttons unless they are specific "pill" variants.
- Avoid using #ffffff as a surface color; use it only for text on dark fills.
- Never pair #fea480 with light backgrounds.
- Do not use SuisseIntl for data readouts; reserve that for digital7Mono.
- Avoid irregular spacing values outside the defined 4px, 7px, 20px scale.

## Surfaces

| Level | Name | Value | Purpose |
| :--- | :--- | :--- | :--- |
| Level 0 | Canvas | #000000 | The primary background for the entire application. |
| Level 1 | Section / Cabinet Base | #0c0805 | Deep espresso warm neutral surface for cabinet cavities. |
| Level 2 | Card / Inner Panel | #18110b | Top gradient stop of wood cubby back walls. |
| Level 3 | Cabinet Frame | #23160e | Heavy architectural walnut border dividing shelf bays. |
| Level 4 | Bevel Highlight | #523722 | Top chamfer bounce light on horizontal shelf edges. |
| Level 5 | LED Emitter Core | #ffe2b7 / #ffffff | White-hot filament center of overhead LED light fixtures. |

## Elevation
The UI is strictly shadowless for standard UI cards, adhering to a flat architectural philosophy. However, the **Architectural Cabinet** utilizes deep cavernous inner shadows (`inset 0 16px 32px rgba(0,0,0,0.92)`) combined with downward radial illumination washes to create a photo-realistic 3D recessed bay depth.

## Imagery
Graphics follow a "High-Tech Industrial & Technical Noir" style. Collectibles use authentic 3D photorealistic renders with dual-state alpha channels (`-off.avif` and `-on.avif`).

## Agent Prompt Guide

### Quick Color Reference
- **Canvas**: `#000000` (Obsidian)
- **Cabinet Wood**: `#0c0805` to `#18110b` (Dark Walnut / Espresso)
- **Cabinet Border**: `#23160e` (Walnut Frame)
- **Bevel Highlight**: `#523722` (Top Chamfer)
- **LED Glow**: `#fea480` (Warm Peach Glow)
- **LED Core**: `#ffe2b7` / `#ffffff` (Champagne White Core)
- **Primary Action**: `#fea480` (Peach Glow)
- **Primary Text**: `#f4f1ff` (Lavender White)
- **Secondary Text**: `#a4805c` (Bronze)
- **Borders**: `#3a3129` (Coffee)

---

### Ready-to-Paste AI Prompts

#### Prompt 1: Full WorkOS Architectural Cabinet Recreation
> **For Antigravity, Cursor, Claude, v0, Bolt, and ChatGPT:**
>
> ```markdown
> Create a high-fidelity "WorkOS Launch Week Summer 2026" architectural cabinet component with overhead LED strip lights and dark walnut cubbies:
> 1. Layout: A 3-column grid container (1160px wide, 728px high) inside a dark canvas (#000000). Left column: 280px wide (2 equal cubbies). Center column: 1fr (~560px wide, 1 tall bay spanning full height). Right column: 280px wide (2 equal cubbies). Grid gap: 16px.
> 2. Cubby Architecture: Background linear-gradient(180deg, #18110b 0%, #100a06 55%, #0c0805 100%). Border: 7px solid #23160e, with border-top: 3px solid #523722 (chamfer highlight) and border-bottom: 5px solid #090604. Deep cavity shadow: inset 0 16px 32px rgba(0,0,0,0.92), inset 0 -16px 32px rgba(0,0,0,0.92), inset 14px 0 24px rgba(0,0,0,0.8), inset -14px 0 24px rgba(0,0,0,0.8).
> 3. Overhead LED Fixture: Mounted flush to the ceiling of every cubby cell. Top emitter bar: 3px high, positioned top: 0, left: 12px, right: 12px, background linear-gradient(90deg, transparent 2%, #ffe2b7 20%, #ffffff 50%, #ffe2b7 80%, transparent 98%), box-shadow: 0 0 10px #fea480, 0 1px 18px #fea480, 0 4px 28px #a4805c. Downward wash: radial-gradient(ellipse at 50% 0%, rgba(254,164,128,0.48) 0%, rgba(164,128,92,0.22) 38%, rgba(12,8,5,0) 78%).
> 4. Centerpiece Framed Poster: A matte black aluminum frame (10px solid #14100c, 1px outline #3d281a, shadow 0 16px 40px rgba(0,0,0,0.95)). Inside: Cosmic space background with lone astronaut on an orbital tower looking at a giant swirling planet. Text: "EVERY ENVIRONMENT TELLS A DIFFERENT STORY" at top in SuisseIntl, bold "PROJECTS HAIL MARY" in center, and "MANAGE DEVELOPMENT, STAGING, AND PRODUCTION UNDER ONE PROJECT, WITH UNIQUE BRANDING FOR EACH." at bottom, with a row of tech glyphs (П, ◇, ▲, ◎, ◈, ⏣, ▼, H).
> 5. Cubby Collectibles:
>    - Top-Left: Science Kit (Microscope and beakers).
>    - Bottom-Left: 3D Printer (Rapid prototyping machine).
>    - Top-Right: Vintage iMac Classic (Screen illuminated with 404 dialog and astronaut figurine).
>    - Bottom-Right: Model Rocket Ship on black stand.
>    Provide hover crossfade on collectibles between idle and glowing active states.
> ```

#### Prompt 2: Overhead Linear LED Light Bar & Downward Wash
> **For Antigravity, Cursor, Claude, v0, Bolt, and ChatGPT:**
>
> ```markdown
> Write a self-contained CSS component for an overhead warm copper/peach LED strip light fixture mounted under a shelf or cabinet ceiling:
> ```html
> <div class="cubby-led-strip">
>   <div class="cubby-led-bar"></div>
>   <div class="cubby-led-wash"></div>
> </div>
> ```
> CSS:
> ```css
> .cubby-led-strip {
>   position: absolute;
>   top: 0;
>   left: 0;
>   right: 0;
>   height: 90%;
>   pointer-events: none;
>   z-index: 3;
> }
> .cubby-led-bar {
>   position: absolute;
>   top: 0;
>   left: 12px;
>   right: 12px;
>   height: 3px;
>   background: linear-gradient(90deg, transparent 2%, #ffe2b7 20%, #ffffff 50%, #ffe2b7 80%, transparent 98%);
>   box-shadow: 0 0 10px #fea480, 0 1px 18px #fea480, 0 4px 28px #a4805c;
>   border-radius: 2px;
> }
> .cubby-led-wash {
>   position: absolute;
>   top: 0;
>   left: -10%;
>   right: -10%;
>   height: 100%;
>   background: radial-gradient(ellipse at 50% 0%, rgba(254,164,128,0.48) 0%, rgba(164,128,92,0.22) 38%, rgba(12,8,5,0) 78%);
> }
> ```
> ```

#### Prompt 3: Technical Noir Typography & UI Kit
> **For Antigravity, Cursor, Claude, v0, Bolt, and ChatGPT:**
>
> ```markdown
> Create a Technical Noir UI card and CTA button following the WorkOS Launch Week design tokens:
> - Container: Background #0c0805, 1px solid #3a3129, 0px border-radius, 20px padding.
> - Headline: SuisseIntl 23.52px, color #f4f1ff, letter-spacing normal.
> - Monospace Readout: digital7Mono 17.2px, color #fea480, letter-spacing 3.1px.
> - Primary Button: Rectangular 0px radius, background #fea480, color #000000, font SuisseIntl 16px medium, 0.2s ease transition, hover background #ffb599.
> ```

### Similar Brands
- **Sentry** — Shared DNA in dark-mode technical interfaces with vibrant, high-contrast accents.
- **Vercel** — Similar reliance on geometric precision and monochromatic foundations.
- **Linear** — Shared focus on high-density, developer-centric UI and subtle metallic gradients.
- **Stripe (Press)** — Similar use of sophisticated typography and architectural layout.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-primary: #fea480;
  --color-secondary: #a4805c;
  --color-accent: #ffe2b7;
  --color-neutral: #f4f1ff;
  --color-background: #0c0805;
  --color-black: #000000;
  --color-border: #3a3129;

  /* Typography — Font Families */
  --font-sans: "SuisseIntl", sans-serif;
  --font-mono: "vt323", monospace;
  --font-digital: "digital7Mono", monospace;

  /* Typography — Scale */
  --text-7xl: 4.5rem;
  --text-2xl: 1.5rem;
  --text-base: 1rem;
  --text-sm: 0.875rem;
  --text-xs: 0.75rem;

  /* Spacing */
  --spacing-1: 4px;
  --spacing-5: 20px;
  --spacing-20: 80px;

  /* Layout */
  --page-max-width: 1150px;
  --section-gap: 80px;
  --card-padding: 20px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-full: 999px;
  --radius-none: 0px;
}
```

### Tailwind v4

```css
@theme {
  --color-peach: #fea480;
  --color-bronze: #a4805c;
  --color-lavender: #f4f1ff;
  --color-obsidian: #000000;
  
  --font-suisse: "SuisseIntl";
  --font-digital: "digital7Mono";
  
  --spacing-xs: 4px;
  --spacing-md: 20px;
  --spacing-xl: 80px;
  
  --radius-none: 0px;
  --radius-pill: 999px;
}
```