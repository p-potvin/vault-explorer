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
