## 2026-05-02 - Keyboard Accessibility & Alt Text
**Learning:** Keyboard accessibility for dialogs (Enter to submit, Escape to close) and missing alt text on image elements are common missing micro-UX features that are straightforward to add.
**Action:** Ensure custom dialogs implement keyboard listeners for standard accessibility actions and explicitly include empty alt text for decorative images and descriptive alt text for main images.

## 2026-05-03 - Custom Grid Card Accessibility
**Learning:** Custom div-based grids (like `.file-card` grids) often lack native focus management. Users lose keyboard accessibility when standard `<button>` or `<a>` elements aren't used for items.
**Action:** Always ensure custom interactive elements like grid cards have `tabIndex="0"`, a clear `:focus-visible` outline for keyboard navigation, and `keydown` event listeners that map the Space or Enter keys to click actions.

## 2026-05-04 - Modal and Overlay Accessibility
**Learning:** Dynamic overlay divs and popups often lack semantic roles, making screen readers ignore them.
**Action:** Always add role="dialog", aria-modal="true", and aria-label to custom modals, and role="status" / aria-live="polite" to loading overlays.

## 2026-05-06 - Proactive Disabled States
**Learning:** Reactive alerts for impossible actions (e.g., clicking "New Folder" before selecting a vault) disrupt the user experience. Users prefer to know what actions are available *before* they click.
**Action:** Use proactive disabled states (`button:disabled`) for buttons when their associated action is contextually invalid, paired with a helpful `title` to explain the state.

## 2026-05-15 - Loading State Layout Preservation
**Learning:** Replacing `innerText` directly on a parent container destroys its child visual elements, such as a loading spinner. This breaks the intended loading state layout and removes the visual indicator of progress.
**Action:** Always target the specific text node element (e.g., `#loading-text`) when updating loading or status messages dynamically, rather than replacing the text content of the entire parent container.

## 2026-05-29 - Context-Aware Empty State CTAs
**Learning:** Explanatory text in empty states often isn't enough; pairing the explanation with a direct, context-aware call-to-action button (like "Browse Vault" or "Clear Filters") significantly improves usability.
**Action:** Always provide an actionable button alongside textual guidance in empty states, ensuring the action is relevant to why the state is empty (e.g., clearing search vs. initial setup).

## 2026-05-30 - Focus Outline Visibility & Hover Tooltips
**Learning:** `opacity: 0` removes the element entirely from rendering, including standard browser focus outlines (e.g., `:focus-visible`). Consequently, interactive but visually hidden elements like overlapping custom checkboxes will trap keyboard focus silently. Furthermore, icon-only buttons with `aria-label`s are readable by screen readers, but sighted users need standard hover `title` tooltips.
**Action:** When creating visually hidden semantic overlays (like a checkbox over a card), override with `opacity: 1` explicitly on `:focus-visible`. Always add `title` text to icon-only close or back buttons.

## 2026-05-31 - Nested Hover & Keyboard Access
**Learning:** Containers that show hidden children exclusively on `:hover` block keyboard accessibility for those child elements (like sliders).
**Action:** Always mirror parent `:hover` trigger rules with `:focus-within` to guarantee nested elements become available when keyboard-tabbed into.
