---
name: Buzz
description: AI-powered social media content generator for product marketing
colors:
  signal-blue: "oklch(55% 0.2 260)"
  signal-blue-hover: "oklch(50% 0.2 260)"
  neutral-bg: "oklch(98% 0.003 260)"
  neutral-surface: "oklch(99% 0.002 260)"
  neutral-border: "oklch(92% 0.005 260)"
  neutral-border-strong: "oklch(87% 0.007 260)"
  neutral-text-primary: "oklch(15% 0.01 260)"
  neutral-text-secondary: "oklch(30% 0.015 260)"
  neutral-text-tertiary: "oklch(50% 0.015 260)"
  neutral-text-muted: "oklch(65% 0.015 260)"
  status-success: "oklch(55% 0.18 145)"
  status-error: "oklch(55% 0.22 25)"
  status-warning: "oklch(70% 0.16 75)"
  status-info: "oklch(55% 0.2 290)"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue-hover}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-text-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    rounded: "{rounded.md}"
    padding: "8px 12px"
  chip:
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: Buzz

## 1. Overview

**Creative North Star: "The Control Room"**

Buzz is a precision instrument for indie marketers who need to move fast. The interface is the control room: every element earns its place, every pixel serves the workflow. No decoration for its own sake. No chrome that doesn't help the user decide or act.

The aesthetic is functional clarity. Dense information, clear hierarchy, scannable at a glance. The generated content—images, captions, product data—is the star. The UI recedes. AI works invisibly behind the scenes, showing results, not machinery.

This system explicitly rejects generic AI/SaaS aesthetics: purple gradients, glow effects, neon accents, "AI-powered" hero sections. It rejects overly playful or toy-like interfaces that undermine professional credibility. It rejects heavy, corporate enterprise tool feel.

**Key Characteristics:**
- Content over chrome. The work speaks; the interface gets out of the way.
- Speed of comprehension. Dense information, clear hierarchy, no decorative padding.
- AI as invisible assistant. Results forward, not the machinery.
- Earn every element. If it doesn't help the user move faster or decide better, it doesn't belong.

## 2. Colors

A restrained palette: neutral grays carry the structure, one signal blue carries action, status colors communicate state. The accent is rare and purposeful.

### Primary
- **Signal Blue** (#2563eb): The one clear voice. Used for primary actions, active states, and interactive links. Its rarity is the point—≤10% of any given screen. Hover state deepens to #1d4ed8.

### Neutral
- **Page Background** (#f9fafb): The canvas. Cool-tinted near-white, never warm.
- **Surface** (#ffffff): Cards, headers, modals. Lifted from the background via border, not shadow.
- **Border** (#e5e7eb): Default divider. Subtle, structural, never decorative.
- **Border Strong** (#d1d5db): Input borders, focus-adjacent states.
- **Text Primary** (#111827): Headings, key values. High contrast, not pure black.
- **Text Secondary** (#374151): Body text, labels. Readable without strain.
- **Text Tertiary** (#6b7280): Supporting text, metadata.
- **Text Muted** (#9ca3af): Placeholders, disabled states. Never use for body text.

### Status
- **Success** (#16a34a): Confirmed actions, active states, approved content.
- **Error** (#dc2626): Failed states, destructive actions, validation errors.
- **Warning** (#ca8a04): Pending states, extraction in progress, attention needed.
- **Info** (#9333ea): Special states, posted content, Instagram integration.

### Named Rules
**The One Voice Rule.** Signal Blue is used on ≤10% of any given screen. Its rarity is the point. If everything is blue, nothing is.

**The No-Gradient Rule.** No purple-to-pink gradients except the Instagram brand mark. The accent is solid, not decorative.

## 3. Typography

**Display Font:** Geist Sans (with system-ui fallback)
**Body Font:** Geist Sans (with system-ui fallback)
**Label/Mono Font:** Geist Mono (with ui-monospace fallback)

**Character:** Geist is a neutral grotesque—legible, modern, invisible. It doesn't compete with the content. The mono variant appears only for technical values (API keys, environment variables, code).

### Hierarchy
- **Display** (700, 1.875rem / clamp up to 2.25rem, 1.2 line-height, -0.02em tracking): Page titles. Rare—only one per page. `text-3xl font-bold` or `text-xl font-bold` depending on context.
- **Heading** (600, 1.25rem, 1.3 line-height): Section titles, card headers. `text-lg font-medium` or `text-xl font-bold`.
- **Body** (400, 0.875rem, 1.5 line-height): Default text. `text-sm`. Max line length ~65ch for readability.
- **Label** (500, 0.875rem, 1.25 line-height): Form labels, button text, navigation. `text-sm font-medium`.
- **Small** (400, 0.75rem, 1.5 line-height): Metadata, chips, timestamps. `text-xs`.
- **Mono** (400, 0.75rem, 1.5 line-height): Technical values, code, API keys. `font-mono text-xs`.

### Named Rules
**The Weight Rule.** Bold (700) is reserved for page titles. Semibold (600) for section headings. Medium (500) for labels and buttons. Regular (400) for everything else. Don't escalate weight to create emphasis—use size or color instead.

## 4. Elevation

This system is flat by default. Depth is conveyed through border and background contrast, not shadow. Surfaces sit on the page; they don't float above it.

The only exception: modals use a subtle backdrop blur (`bg-black/50`) to separate them from the page. No drop shadows on cards, buttons, or inputs.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. No `box-shadow` on cards, buttons, or inputs. Depth comes from border + background contrast. If you're reaching for a shadow, the hierarchy is wrong—fix the border or color instead.

## 5. Components

### Buttons
- **Shape:** Gently curved edges (8px radius). Not pill-shaped, not sharp.
- **Primary:** Signal Blue background, white text, 8px 16px padding. Hover deepens to #1d4ed8. No shadow, no border.
- **Secondary:** Transparent background, gray-700 text, 1px gray-300 border, 8px 16px padding. Hover shifts border to gray-400, background to gray-50.
- **Ghost:** No background, no border. Blue text for links, gray text for neutral actions. Hover underlines or shifts color.
- **Focus:** 2px blue-500 ring, offset 2px. No glow, no outline-offset games.
- **Disabled:** 50% opacity. No cursor change. Don't hide the button—just mute it.

### Cards
- **Corner Style:** 8px radius. Consistent across all card types.
- **Background:** White (#ffffff). Never tinted.
- **Border:** 1px gray-200. The only elevation. No shadow.
- **Internal Padding:** 16px default. 24px for settings-style forms.
- **Hover:** Border shifts to gray-300. No lift, no shadow, no scale.

### Inputs / Fields
- **Style:** 1px gray-300 border, 8px radius, white background, 8px 12px padding.
- **Focus:** 2px blue-500 ring (inset), border shifts to blue-500. No glow, no label color change.
- **Error:** Border shifts to red-500. Error message appears below in red-600 text-xs.
- **Disabled:** Gray-100 background, gray-400 text. Border stays gray-200.
- **Placeholder:** Gray-400 text. Never use for instructions—use a label or helper text.

### Chips / Badges
- **Style:** 4px radius, 2px 8px padding. Small, dense, scannable.
- **Color Assignment:** Background is a tinted gray (gray-100 for neutral, green-100 for success, red-100 for error, blue-100 for info, yellow-100 for warning, purple-100 for special). Text matches the tint family at 700 weight.
- **State:** Chips are passive indicators. No hover state unless they're interactive (then they become buttons).

### Navigation
- **Header:** White background, 1px gray-200 bottom border, 16px vertical padding.
- **Logo + Title:** Left-aligned. Icon 32px, title text-xl font-bold gray-900.
- **Back Arrow:** Gray-500, hover gray-700. No background, no border.
- **Primary Action:** Right-aligned blue-600 button.
- **Mobile:** Same structure, no hamburger menu—this is a single-user tool.

### Modals
- **Backdrop:** `bg-black/50`, covers viewport, click-to-dismiss.
- **Card:** White, 8px radius, max-width 4xl, max-height 90vh, flex column.
- **Header:** 1px gray-200 bottom border, 16px padding, title left, close right.
- **Body:** Flexible, scrollable, 24px padding.
- **Footer:** 1px gray-200 top border, 16px padding, actions right-aligned.

## 6. Do's and Don'ts

### Do:
- **Do** use Signal Blue for primary actions only. ≤10% of the screen.
- **Do** use gray-900 for headings, gray-700 for body text, gray-500 for metadata. Never use gray-400 for body text.
- **Do** use 8px radius for cards, buttons, inputs. 4px for chips. 9999px for avatars and close buttons.
- **Do** use 1px gray-200 borders for card edges. 1px gray-300 for input borders.
- **Do** use Geist Sans for everything. Geist Mono only for technical values (API keys, code, env vars).
- **Do** use status colors semantically: green = success/active, red = error/destructive, yellow = pending/warning, purple = special/posted.
- **Do** keep the interface dense. Information over decoration. White space is structural, not decorative.

### Don't:
- **Don't** use purple gradients, glow effects, or neon accents. This is not a generic AI tool.
- **Don't** use shadows for elevation. The system is flat. Depth comes from border + background contrast.
- **Don't** use border-left greater than 1px as a colored accent stripe. Never intentional.
- **Don't** use gradient text (`background-clip: text`). Decorative, never meaningful.
- **Don't** use glassmorphism as default. Blurs and glass cards are prohibited except modal backdrops.
- **Don't** use the hero-metric template (big number, small label, gradient accent). SaaS cliché.
- **Don't** use identical card grids with icon + heading + text repeated endlessly. Vary the structure.
- **Don't** use tiny uppercase tracked eyebrows above every section. The 2023-era kicker is AI grammar.
- **Don't** use numbered section markers (01 / 02 / 03) as default scaffolding.
- **Don't** let text overflow its container. Test heading copy at every breakpoint.
- **Don't** use pure gray (#808080) for text. Always use a gray with a slight cool tint (gray-500, gray-600, etc.).
- **Don't** use warm-tinted neutrals (cream, sand, beige, paper). The background is cool gray-50, not warm.
- **Don't** add comments to code unless asked. The code speaks for itself.
