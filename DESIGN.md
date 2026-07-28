---
name: PinGGo
description: Internal messaging platform with a calm, dark, command-center aesthetic
colors:
  bg: "#1a1d21"
  surface: "#222529"
  border: "#2d3035"
  text: "#d1d2d3"
  text-muted: "#7a7f88"
  accent: "#4f8ef7"
  online: "#3abf7e"
  away: "#e0b94a"
  dnd: "#e05a4e"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "9px 11px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: PinGGo

## Overview

**Creative North Star: "The Command Center"**

PinGGo's visual language is a calm, dark command center — an interface that recedes into the background so conversations take center stage. The palette is deliberately restrained: deep carbon surfaces, muted borders, and a single blue accent that appears only where action is needed. Every element earns its presence through function, not decoration.

The system follows a minimal-and-functional philosophy: "Design that doesn't get in the way, just works." Typography is the system font stack — invisible by design, optimized for readability at chat density. Depth is conveyed through subtle tonal layering rather than shadows, with elevation reserved exclusively for interactive states and modal overlays.

**Key Characteristics:**
- Dark-on-dark tonal hierarchy (bg → surface → border)
- Single accent blue for all interactive states
- System typography for zero-friction readability
- Tonal layering over shadows for depth
- Functional color for status (online/away/dnd)

## Colors

The palette is a calm, dark scheme with a single accent — professional and focused.

### Primary
- **Calm Blue** (#4f8ef7): The sole action color. Used for focused inputs, send buttons, active states, links, and interactive highlights. Appears on ≤15% of any screen — its scarcity signals importance.

### Neutral
- **Carbon Background** (#1a1d21): The deepest layer. Page background, app shell.
- **Surface** (#222529): Elevated containers — sidebar, modals, cards, input fields.
- **Border** (#2d3035): Dividers, input strokes, subtle separations.
- **Text Primary** (#d1d2d3): Main content, usernames, channel names.
- **Text Muted** (#7a7f88): Timestamps, secondary labels, placeholders, disabled states.

### Status
- **Online** (#3abf7e): Presence dot for active users.
- **Away** (#e0b94a): Idle / stepped away indicator.
- **Do Not Disturb** (#e05a4e): DND status, error states, destructive actions.

### Named Rules
**The Accent Scarcity Rule.** The accent blue is reserved for elements the user can act on. Never use it for decorative purposes or passive content. Its visual weight comes from restraint.

**The Tonal Depth Rule.** Depth is communicated through background color progression (bg → surface → border), not through drop shadows. Shadows appear only as a response to elevation state.

## Typography

**Body Font:** System stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)

**Character:** Invisible by design. The system font stack provides native readability at every density without importing external weights or widths. No decorative type — every glyph serves comprehension.

### Hierarchy
- **Title** (700, 15px, normal): Channel names in header, modal titles.
- **Body** (400, 14px, 1.5): Message content, input text, primary content.
- **Label** (600, 13px): Field labels, section titles, sidebar items.
- **Caption** (400, 11–12px): Timestamps, file sizes, badges, metadata.
- **Micro** (700, 10px): Role badges, unread counts, uppercase labels.

### Named Rules
**The Readability Density Rule.** At chat density, every pixel of line-height matters. Body text never drops below 1.5 line-height; captions never below 1.3. Readability outranks compactness.

## Layout

The interface follows a classic three-zone chat layout: sidebar (260px fixed) + main content (flex). The sidebar is a dark surface panel separated by a single border line. The main area uses the deepest background tier, with message lists scrolling vertically.

**Spacing rhythm:** 4px base unit. Components use 8/12/16/20/24px steps. Inline padding is generous (16px) to let content breathe; vertical gaps between messages are tight (3–5px) to maintain density.

**Responsive:** The sidebar collapses on narrow viewports. Modals use `min()` for fluid width capping.

## Elevation & Depth

The system is tonal-by-default: flat surfaces at rest, with depth conveyed through background color progression. Shadows are reactive — they appear only on hover, focus, and modal overlays.

### Shadow Vocabulary
- **Modal overlay** (`0 18px 60px rgba(0,0,0,.4)`): Used on modal dialogs to lift them above the app shell. The overlay itself is `rgba(0,0,0,.6)`.
- **Hover glow** (subtle): Interactive elements gain a border-color shift on hover, not a shadow.

### Named Rules
**The Flat-By-Default Rule.** All surfaces are flat at rest. Shadows and elevation effects only appear as a direct response to user interaction (hover, focus) or system state (modal open).

## Shapes

Corner strategy is minimal and consistent: small radii (4–6px) for compact elements like badges and dots, medium radii (6–8px) for inputs and buttons, larger radii (10px) for modals and cards. The full-radius (9999px) is reserved for pills and avatars.

**Form language:** Rectangular with rounded corners. No sharp edges on interactive elements. Border treatment is 1px solid at all times — no borderless inputs, no borderless cards.

## Components

### Buttons
- **Shape:** 6px radius, horizontal padding 16px, vertical 8px
- **Primary:** Accent blue background (#4f8ef7), white text, transitions on background 0.15s
- **Hover:** 15% opacity reduction (darken)
- **Secondary / Ghost:** Transparent background, border-only, muted text color. Border shifts to accent on hover.
- **Danger:** DND color (#e05a4e) for destructive actions, with confirmation step.

### Inputs
- **Style:** Carbon background, 1px border, 6px radius. Text in primary color.
- **Focus:** Border shifts to accent blue. No outline, no glow.
- **Placeholder:** Muted text color.
- **Disabled:** 60% opacity.

### Cards / Containers
- **Background:** Surface tier (#222529)
- **Border:** 1px solid border color
- **Radius:** 10px (modals), 8px (cards)
- **Shadow:** Only on modals (reactive)

### Navigation (Sidebar)
- **Background:** Surface tier, 260px fixed width
- **Items:** Text in muted color, hover shifts to primary text with surface background
- **Active state:** Accent-tinted background (`rgba(79,142,247,0.15)`), primary text
- **Badges:** Accent background, white text, 18px pill

### Presence Dots
- **Style:** 10px circle, color-coded by status
- **States:** Online (green), Away (yellow), DND (red), Offline (muted gray)

### Reaction Chips
- **Style:** Transparent background, border, 12px radius
- **Active/Own:** Accent-tinted background, accent border
- **Hover:** Slightly lighter background

## Do's and Don'ts

### Do:
- **Do** use the accent blue sparingly — only for interactive elements and active states.
- **Do** maintain the tonal hierarchy: bg → surface → border for depth.
- **Do** use system fonts for all text — no external font imports.
- **Do** keep message density high with tight vertical gaps (3–5px).
- **Do** use functional colors consistently: green=online, yellow=away, red=dnd/error.

### Don't:
- **Don't** use accent blue for decorative elements or passive content.
- **Don't** add drop shadows to flat elements at rest.
- **Don't** use sharp corners (0px radius) on interactive elements.
- **Don't** mix multiple accent colors — the single blue is the only action color.
- **Don't** reduce body line-height below 1.5 — readability at chat density is critical.
