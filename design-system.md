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

### Don't
- Never use soft shadows; depth is achieved through color contrast and borders.
- Do not use border-radius on buttons unless they are specific "pill" variants.
- Avoid using #ffffff as a surface color; use it only for text on dark fills.
- Never pair #fea480 with light backgrounds.
- Do not use SuisseIntl for data readouts; reserve that for digital7Mono.
- Avoid irregular spacing values outside the defined 4px, 7px, 20px scale.

## Surfaces

| Level | Name | Value | Purpose |
| :--- | :--- | :--- | :--- |
| Level 0 | Canvas | #000000 | The primary background for the entire application. |
| Level 1 | Section | #0c0805 | Secondary background for alternating sections or large containers. |
| Level 2 | Card | #191919 | The darkest point of a component gradient, used for elevated surfaces. |
| Level 3 | Highlight | #3a3129 | Used for borders and subtle hover states on dark surfaces. |

## Elevation
The UI is strictly shadowless, adhering to a flat, architectural philosophy. Depth is communicated through "Figure/Ground" separation using high-contrast borders (#3a3129) and subtle background shifts between #000000 and #0c0805. When elevation is required, it is achieved through glowing borders or inner gradients rather than traditional drop shadows.

## Imagery
Graphics follow a "High-Tech Industrial" style. Product cards use square aspect ratios (1:1) with "fill" object-fit settings. Visuals often incorporate complex gradients, including radial glows and conic gradients that mimic light reflecting off metallic surfaces. Icons are sharp and stroke-based, matching the technical precision of the typography.

## Agent Prompt Guide

### Quick Color Reference
- **Canvas**: `#000000` (Obsidian)
- **Primary Action**: `#fea480` (Peach Glow)
- **Primary Text**: `#f4f1ff` (Lavender White)
- **Secondary Text**: `#a4805c` (Bronze)
- **Borders**: `#3a3129` (Coffee)

### Example Component Prompts
1. **Primary Button**: Create a rectangular button with 0px radius, background #fea480, text #000000, font SuisseIntl 16px Medium, and 0.2s ease-out transition.
2. **Data Badge**: Create a pill-shaped badge with 999px radius, 1px border #3a3129, background #0c0805, text #dcdad6 in digital7Mono 17px with 3px letter-spacing.
3. **Content Card**: Create a 0px radius container with 1px border #3a3129, background linear-gradient(155deg, #3d3934 0%, #191919 100%), and 20px internal padding.
4. **Display Headline**: Create a text element using SuisseIntl 72px, weight 400, color #f4f1ff, line-height 1, and letter-spacing -0.05em.

### Signature Motifs
The brand identity is anchored by three motifs: the **Brutalist Grid** (sharp 0px corners and 1px borders), the **Digital Readout** (monospaced type with extreme tracking), and the **Copper Glow** (warm metallic accents against a cold black canvas).

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