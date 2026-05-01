## 2024-04-30 - Focus Visibility and Dynamic Aria Labels
**Learning:** Removing default outlines (`outline: none`) without providing a custom `:focus-visible` state completely breaks keyboard navigation for interactive elements like buttons and inputs. Dynamically generated inputs (like file checkboxes or inline rename fields) often miss `aria-label`s, rendering them invisible to screen readers since they have no associated visible label.
**Action:** Always ensure that any element with `outline: none` implements a custom `:focus-visible` style using brand tokens (e.g., `var(--vault-cyan)`). Remember to interpolate context-specific names into `aria-label`s for dynamically generated, icon-only, or label-less inputs.

## 2026-04-30 - Empty States for Filtering and Initial Load
**Learning:** Leaving the UI completely blank when no folder is selected or when filters yield no results leaves users confused and unsure if the app is broken or just empty.
**Action:** Always provide contextual "Empty State" graphics and copy to guide users when data arrays are explicitly empty.
