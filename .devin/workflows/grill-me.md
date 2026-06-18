---
name: grill-me
description: >
  Run an exhaustive, one-question-at-a-time UI/UX interrogation BEFORE writing any frontend code. Trigger on ANY request to design or improve a human-facing interface — "design an interface", "design a GUI", "build a frontend", "improve the UI", "improve the UX", "redo this screen", "make a dashboard", "design a page", "grill me", "grill me about my GUI", "grill me about my UI", "interview me about this design", or any task that ends in a user-visible surface. The goal: every layout, spacing, motion, color, and copy decision is resolved by the user before a single line of JSX/HTML/CSS is written. Minimum 10 questions, each with 3+ recommended choices plus a free-text option.
metadata:
  author: vaultwares
  version: "1.0.0"
---

# grill-me

You are about to design or improve a human-facing interface. Do not write code yet. Run the interrogation below first.

## Hard rules

- Ask **one question at a time**. Wait for the answer before sending the next.
- **Minimum 10 questions.** Cover every category in the bank below until every branch of the design tree is resolved.
- Every question presents **at least 3 concrete recommended choices + 1 free-text "Other" option**. Use the AskUserQuestion tool when available.
- If a question can be answered by reading the codebase (existing components, design tokens, theme files, prior screens), **read the codebase instead of asking**.
- Do **not** write code, component scaffolds, JSX, HTML, CSS, design tokens, or pseudocode until the interrogation is closed and the design contract (below) is acknowledged.
- The user wants to be grilled. Lean invasive. "I'll figure it out as I build" is not an acceptable shortcut.

## Question 1 — FIXED, ask first, verbatim

> **Do you want to use the VaultWares theme? Which one?**

Choices (present exactly these):

1. No, the theme I want has no precedent
2. Yes, the VaultWares Redesign
3. Yes, but only console mode
4. Yes but only warm mode
5. No, look at this: `<free text — paste a link to the design to use as inspiration>`

**VaultWares theme = the Redesign only.** The Redesign has two modes: **warm mode** (paper / beige shells) and **console mode** (dark aubergine operational surface). Never the legacy themes — no golden slate, no solarized light, no pre-Redesign palettes. If the user names a legacy theme, redirect to one of the Redesign modes or to choice 1/5.

Token sources when the user picks 2/3/4:

- `vaultwares-themes/assets/ui-kit.md` — vocabulary, spacing, motion, voice
- `vaultwares-themes/assets/console-operational-system.md` — console + warm mode surfaces
- `vaultwares-themes/brand/tokens/tokens.ts` and `tailwind.config.ts` — canonical token values

## Branching after Q1

- **Choices 2 / 3 / 4 (VaultWares Redesign path):** skip vibes. Go straight to technical questions (categories 5–14 below). Theme tokens already decide color, typography, density baseline — confirm those then drill into icon set, sizing, motion, copy tone.
- **Choices 1 / 5 (custom / external path):** start with vibes (categories 2–4), then layout, then technical. If choice 5, read the linked inspiration first (use a web tool) before asking the next question.

## Question bank — expand each into one or more concrete questions with choices

1. **Theme** (Q1, fixed above)
2. **Vibe / tone** — professional vs funky, serious vs playful, hot vs cold, dense vs airy, retro vs futuristic *(custom path only)*
3. **Mood reference** — name an app or site whose feel they want to echo *(custom path only)*
4. **Voice** — instructional / terse / friendly / corporate
5. **Layout primitives** — grid vs stack, how many columns at desktop width, sidebar / no sidebar, full-bleed vs centered max-width
6. **Information density** — compact / comfortable / spacious; rows per screen
7. **Navigation pattern** — top bar, side rail, bottom tabs, command palette, breadcrumb
8. **Primary action style** — button shape (pill / rounded / sharp), corner radius in px, padding (x and y in px), filled vs outline, primary color usage
9. **Iconography** — set (Lucide / Phosphor / Heroicons / custom), size in px, stroke weight, filled vs outline
10. **Motion** — none / quick (<150ms) / smooth (200–300ms) / springy; what animates (page transitions, hover, focus, list reorder)
11. **Typography** — heading scale (1.125 / 1.250 / 1.333), body size in px, line height, mono font usage
12. **Color usage beyond theme** — accent color, semantic palette (success / warning / danger / info), data-viz palette if charts
13. **States** — empty / loading (skeleton vs spinner) / error / disabled / hover / focus / selected
14. **Responsive** — breakpoints in px, mobile behavior (stack / drawer / bottom sheet), touch-target floor
15. **Accessibility floor** — contrast target (AA / AAA), focus-ring style, keyboard nav coverage, reduced-motion fallback
16. **Out-of-scope** — what is explicitly NOT in this design (dark mode? print? RTL? i18n?)

## Closure — design contract

When every applicable category is resolved, echo back a single paragraph that names every decision: theme + mode, layout shape, density, nav pattern, button spec, icon spec, motion spec, typography scale, color usage, state handling, breakpoints, a11y floor, and out-of-scope items. Ask the user to confirm with a single word ("ship" / "go" / "yes"). Only then write code.

