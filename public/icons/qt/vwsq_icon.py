"""vaultsqware icons for Qt6 (PySide6 or PyQt6).

Qt draws SVG natively through the QtSvg module (SVG Tiny 1.2), so the same
files the web uses work here. What Qt does not do reliably is resolve
`currentColor`, so this helper substitutes a concrete colour before rendering.

    from vwsq_icon import vwsq_icon
    button.setIcon(vwsq_icon("play", "#bac2d2"))
    button.setIcon(vwsq_icon("play", "#bac2d2", active="#e6eaf2", disabled="#6b7385"))

Icons load from the compiled resource (`pyside6-rcc vwsq_icons.qrc -o vwsq_icons_rc.py`,
then `import vwsq_icons_rc`) and fall back to ../svg/ on disk.
"""
from __future__ import annotations

import os

try:
    from PySide6.QtCore import QByteArray, QFile, QRectF, Qt
    from PySide6.QtGui import QIcon, QPainter, QPixmap
    from PySide6.QtSvg import QSvgRenderer
except ImportError:  # PyQt6
    from PyQt6.QtCore import QByteArray, QFile, QRectF, Qt
    from PyQt6.QtGui import QIcon, QPainter, QPixmap
    from PyQt6.QtSvg import QSvgRenderer

_SVG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "svg")
_cache: dict[str, str] = {}

# Console tokens, so callers can pass a role instead of a hex.
ROLES = {
    "text": "#bac2d2", "bright": "#e6eaf2", "secondary": "#9aa1b0",
    "iris": "#6e7bf2", "coral": "#ff8a6b", "ink": "#0f1116",
    "online": "#56d98d", "alert": "#f45d6b", "warning": "#e9b054", "idle": "#6b7385",
}


def _source(name: str) -> str:
    if name not in _cache:
        f = QFile(f":/vwsq/{name}.svg")
        if f.open(QFile.OpenModeFlag.ReadOnly):
            _cache[name] = bytes(f.readAll()).decode()
            f.close()
        else:
            with open(os.path.join(_SVG_DIR, f"{name}.svg"), encoding="utf-8") as fh:
                _cache[name] = fh.read()
    return _cache[name]


def vwsq_pixmap(name: str, color: str = "text", size: int = 20, dpr: float = 2.0) -> QPixmap:
    svg = _source(name).replace("currentColor", ROLES.get(color, color))
    renderer = QSvgRenderer(QByteArray(svg.encode()))
    pm = QPixmap(int(size * dpr), int(size * dpr))
    pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    renderer.render(p, QRectF(0, 0, size * dpr, size * dpr))
    p.end()
    pm.setDevicePixelRatio(dpr)
    return pm


def vwsq_icon(name: str, color: str = "text", *, active: str | None = None,
              disabled: str | None = "idle", sizes=(16, 20, 24, 32)) -> QIcon:
    icon = QIcon()
    for s in sizes:
        icon.addPixmap(vwsq_pixmap(name, color, s), QIcon.Mode.Normal)
        if active:
            icon.addPixmap(vwsq_pixmap(name, active, s), QIcon.Mode.Active)
            icon.addPixmap(vwsq_pixmap(name, active, s), QIcon.Mode.Selected)
        if disabled:
            icon.addPixmap(vwsq_pixmap(name, disabled, s), QIcon.Mode.Disabled)
    return icon
