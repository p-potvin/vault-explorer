# Icons

164 single-ink line icons. The ink is `currentColor`, so shown here through `<img>` they render black: in an app they take the colour of the text around them.

- Grid 24×24, 2px stroke, round caps and joins, no fills except dots.
- Signature: one gap per icon, cut into the longest edge of the dominant shape (about 30% of that edge, a visible opening of about 2–3px at 24px). Circles open toward the upper-left or lower-right; chevrons open at the apex.
- Exceptions without a gap: dot glyphs (more-h, more-v, grip), window chrome (minimize, maximize, restore), minus and fullscreen, where a gap would change the meaning.
- Source of truth: `vaultsqware/icons/build.py` in vaultwares-themes. Edit shapes there and re-run it; it rewrites the SVGs, `sprite.svg`, the React components, the Qt `.qrc` and `icons.json`.
