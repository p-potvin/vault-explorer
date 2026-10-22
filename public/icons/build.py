"""vaultsqware icon set: one source, every target.

Every icon is drawn on a 24-unit grid with a 2-unit round stroke and carries
ONE interruption: a gap cut into the longest edge of its dominant shape (the
"gapped edge", after the play glyph). Shapes are authored with the helpers
below; the gap is computed, never hand-placed, so the rhythm stays uniform.

    python icons/build.py

writes
    svg/<name>.svg            currentColor, for web / Electron / <img> tinting via CSS mask
    sprite.svg                <symbol id="vwsq-<name>"> sprite for vanilla apps
    react/index.tsx           typed React components (IconPlay, …)
    qt/vwsq_icons.qrc         Qt6 resource file over svg/
    icons.json                manifest (name, component, category)
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
STROKE = 2

def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def gap_len(seg_len):
    # ~30% of the edge, clamped: visible opening is gap - stroke (round caps)
    return max(3.4, min(6.2, seg_len * 0.3))

# ---------------------------------------------------------------- primitives
# Every primitive returns (svg_markup, gap_capable_builder). The builder takes
# a gap spec and returns markup with the gap cut.

class Shape:
    can_gap = False
    def svg(self, gap=None): raise NotImplementedError

class Poly(Shape):
    """Polyline / polygon. gap: None, True (longest edge), int (edge index),
    ('t', idx, t) edge + position, or ('v', idx) cut at a vertex."""
    can_gap = True
    def __init__(self, pts, closed=False, gap=None):
        self.p, self.closed, self.gap = pts, closed, gap
    def edges(self):
        n = len(self.p)
        idx = range(n if self.closed else n - 1)
        return [(self.p[i], self.p[(i + 1) % n]) for i in idx]
    def plain(self):
        d = "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in self.p)
        return d + (" Z" if self.closed else "")
    def svg(self, gap=None):
        g = self.gap if gap is None else gap
        if g is None or g is False:
            return self.plain()
        E = self.edges()
        if isinstance(g, tuple) and g[0] == "v":           # cut at a vertex
            v = g[1]; P = self.p; a = P[v - 1]; b = P[v]; c = P[(v + 1) % len(P)]
            cut = 1.9
            def toward(p, q, d):
                L = math.dist(p, q); return (p[0] + (q[0] - p[0]) * d / L, p[1] + (q[1] - p[1]) * d / L)
            a2, c2 = toward(b, a, cut), toward(b, c, cut)
            pts1 = P[:v] + [a2]; pts2 = [c2] + P[v + 1:]
            return Poly(pts1).plain() + " " + Poly(pts2).plain()
        t = 0.5
        if g is True:
            lens = [math.dist(a, b) for a, b in E]
            k = max(range(len(E)), key=lambda i: (round(lens[i], 1), -i))
        elif isinstance(g, tuple):
            _, k, t = g
        else:
            k = g
        a, b = E[k]
        L = math.dist(a, b); G = gap_len(L)
        def at(u): return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
        g0, g1 = at(t - G / 2 / L), at(t + G / 2 / L)
        n = len(self.p)
        if self.closed:
            order = [g1] + [self.p[(k + 1 + i) % n] for i in range(n)] + [g0]
            return Poly(order).plain()
        return Poly(self.p[:k + 1] + [g0]).plain() + " " + Poly([g1] + self.p[k + 1:]).plain()

def P(*pts, closed=False, gap=None): return Poly(list(pts), closed, gap)
def G(*pts, gap=True): return Poly(list(pts), True, gap)      # closed polygon, gapped
def L(x1, y1, x2, y2, gap=None): return Poly([(x1, y1), (x2, y2)], False, gap)

class Rect(Shape):
    can_gap = True
    def __init__(self, x, y, w, h, r=2, gap=None):
        self.x, self.y, self.w, self.h, self.r, self.gap = x, y, w, h, min(r, w / 2, h / 2), gap
    def svg(self, gap=None):
        g = self.gap if gap is None else gap
        x, y, w, h, r = self.x, self.y, self.w, self.h, self.r
        if g is None or g is False:
            return (f"M{fmt(x + r)} {fmt(y)} H{fmt(x + w - r)} A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + w)} {fmt(y + r)} "
                    f"V{fmt(y + h - r)} A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + w - r)} {fmt(y + h)} H{fmt(x + r)} "
                    f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x)} {fmt(y + h - r)} V{fmt(y + r)} A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x + r)} {fmt(y)} Z")
        side = g if isinstance(g, str) else ("left" if h >= w else "top")
        # walk clockwise starting just after the gap on the chosen side
        c = {"tl": (x, y), "tr": (x + w, y), "br": (x + w, y + h), "bl": (x, y + h)}
        segs = {  # side -> (start, end) of its straight run, clockwise
            "top": ((x + r, y), (x + w - r, y)), "right": ((x + w, y + r), (x + w, y + h - r)),
            "bottom": ((x + w - r, y + h), (x + r, y + h)), "left": ((x, y + h - r), (x, y + r))}
        order = ["top", "right", "bottom", "left"]
        corner_after = {"top": (x + w, y + r), "right": (x + w - r, y + h), "bottom": (x, y + h - r), "left": (x + r, y)}
        a, b = segs[side]; Ls = math.dist(a, b)
        Gp = min(gap_len(w if side in ("top", "bottom") else h), Ls * 0.6)
        def at(u): return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
        g0, g1 = at(0.5 - Gp / 2 / Ls), at(0.5 + Gp / 2 / Ls)
        i = order.index(side)
        d = f"M{fmt(g1[0])} {fmt(g1[1])} L{fmt(b[0])} {fmt(b[1])}"
        for k in range(4):
            s = order[(i + k) % 4]
            ca = corner_after[s]
            d += f" A{fmt(r)} {fmt(r)} 0 0 1 {fmt(ca[0])} {fmt(ca[1])}" if r > 0 else f" L{fmt(ca[0])} {fmt(ca[1])}"
            nxt = order[(i + k + 1) % 4]
            na, nb = segs[nxt]
            if k < 3:
                d += f" L{fmt(nb[0])} {fmt(nb[1])}"
        d += f" L{fmt(g0[0])} {fmt(g0[1])}"
        return d

def R(x, y, w, h, r=2, gap=None): return Rect(x, y, w, h, r, gap)

class Circle(Shape):
    can_gap = True
    def __init__(self, cx, cy, r, gap=None):
        self.cx, self.cy, self.r, self.gap = cx, cy, r, gap
    def svg(self, gap=None):
        g = self.gap if gap is None else gap
        cx, cy, r = self.cx, self.cy, self.r
        if g is None or g is False:
            return f"M{fmt(cx - r)} {fmt(cy)} A{fmt(r)} {fmt(r)} 0 1 0 {fmt(cx + r)} {fmt(cy)} A{fmt(r)} {fmt(r)} 0 1 0 {fmt(cx - r)} {fmt(cy)}"
        ang = 225 if g is True else g
        half = math.degrees(gap_len(2 * math.pi * r * 0.5) / r / 2)
        a0, a1 = math.radians(ang + half), math.radians(ang - half + 360)
        p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0)); p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
        return f"M{fmt(p0[0])} {fmt(p0[1])} A{fmt(r)} {fmt(r)} 0 1 1 {fmt(p1[0])} {fmt(p1[1])}"

def C(cx, cy, r, gap=None): return Circle(cx, cy, r, gap)

class Raw(Shape):
    def __init__(self, d): self.d = d
    def svg(self, gap=None): return self.d

def RAW(d): return Raw(d)

class Dot(Shape):
    def __init__(self, cx, cy, r): self.cx, self.cy, self.r = cx, cy, r
    def svg(self, gap=None): return None
    def el(self): return f'<circle cx="{fmt(self.cx)}" cy="{fmt(self.cy)}" r="{fmt(self.r)}" fill="currentColor" stroke="none"/>'

def D(cx, cy, r=1.15): return Dot(cx, cy, r)

# ---------------------------------------------------------------- the set
# The FIRST gap-capable shape takes the gap unless another shape sets gap=
# explicitly; pass gap=False on the first to opt it out. `nogap` icons are
# the documented exceptions (dots, window chrome, one-stroke glyphs).

ICONS = {}
def icon(name, cat, *shapes, nogap=False):
    ICONS[name] = (cat, shapes, nogap)

def gear():
    pts = []
    for k in range(8):
        a = math.radians(k * 45 - 90)
        for da, rr in ((-13, 9.2), (13, 9.2), (22.5 - 5, 6.9), (22.5 + 5, 6.9)):
            pts.append((12 + rr * math.cos(a + math.radians(da)), 12 + rr * math.sin(a + math.radians(da))))
    return G(*pts, gap=1)

def arrowhead(x, y, d, s=5):
    return {"r": P((x - s, y - s), (x, y), (x - s, y + s)), "l": P((x + s, y - s), (x, y), (x + s, y + s)),
            "u": P((x - s, y + s), (x, y), (x + s, y + s)), "d": P((x - s, y - s), (x, y), (x + s, y - s))}[d]

# Navigation
icon("home", "navigation", P((5, 10), (5, 20.5), (19, 20.5), (19, 10), gap=0), P((2.5, 11.5), (12, 3.5), (21.5, 11.5)), P((10, 20.5), (10, 15), (14, 15), (14, 20.5)))
icon("dashboard", "navigation", R(3, 3, 8, 18), R(13, 3, 8, 8), R(13, 13, 8, 8))
icon("menu", "navigation", L(4, 12, 20, 12, gap=("t", 0, 0.68)), L(4, 6, 20, 6), L(4, 18, 20, 18))
icon("search", "navigation", C(10.5, 10.5, 7, gap=225), L(15.6, 15.6, 20.5, 20.5))
icon("settings", "navigation", gear(), C(12, 12, 3))
icon("sliders", "navigation", L(4, 7, 20, 7, gap=("t", 0, 0.62)), L(4, 17, 20, 17), C(9, 7, 2.2), C(15, 17, 2.2))
icon("bell", "navigation", L(4, 17, 20, 17, gap=True), RAW("M6 17V11a6 6 0 0 1 12 0v6"), RAW("M10 20.5h4"))
icon("bell-off", "navigation", L(4, 17, 20, 17, gap=True), RAW("M6 17V11a6 6 0 0 1 9.5-4.9M18 11v6"), RAW("M10 20.5h4"), L(3.5, 3.5, 20.5, 20.5))
icon("user", "navigation", RAW("M4 21v-1a6 6 0 0 1 6-6h.3M13.7 14h.3a6 6 0 0 1 6 6v1"), C(12, 7.5, 4))
icon("user-plus", "navigation", RAW("M2.5 21v-1a6 6 0 0 1 6-6h.3M12.2 14h.3a6 6 0 0 1 6 6v1"), C(10.5, 7.5, 4), L(19, 5, 19, 11), L(16, 8, 22, 8))
icon("users", "navigation", RAW("M2.5 21v-.5A5.5 5.5 0 0 1 8 15M10 15a5.5 5.5 0 0 1 5.5 5.5v.5"), C(9, 8, 3.5), RAW("M16 4.6a3.4 3.4 0 0 1 0 6.8M18 15a4 4 0 0 1 3.5 4v2"))
icon("logout", "navigation", P((10, 3.5), (5, 3.5), (5, 20.5), (10, 20.5), gap=True), L(10, 12, 21, 12), P((17, 8), (21, 12), (17, 16)))
icon("login", "navigation", P((14, 3.5), (19, 3.5), (19, 20.5), (14, 20.5), gap=True), L(3, 12, 14, 12), P((10, 8), (14, 12), (10, 16)))
icon("chevron-left", "navigation", P((15, 5), (8, 12), (15, 19), gap=("v", 1)))
icon("chevron-right", "navigation", P((9, 5), (16, 12), (9, 19), gap=("v", 1)))
icon("chevron-up", "navigation", P((5, 15), (12, 8), (19, 15), gap=("v", 1)))
icon("chevron-down", "navigation", P((5, 9), (12, 16), (19, 9), gap=("v", 1)))
icon("arrow-left", "navigation", L(20, 12, 4, 12, gap=("t", 0, 0.42)), arrowhead(4, 12, "l", 6))
icon("arrow-right", "navigation", L(4, 12, 20, 12, gap=("t", 0, 0.42)), arrowhead(20, 12, "r", 6))
icon("arrow-up", "navigation", L(12, 20, 12, 4, gap=("t", 0, 0.42)), arrowhead(12, 4, "u", 6))
icon("arrow-down", "navigation", L(12, 4, 12, 20, gap=("t", 0, 0.42)), arrowhead(12, 20, "d", 6))
icon("close", "navigation", L(5, 5, 19, 19, gap=True), L(19, 5, 5, 19))
icon("check", "navigation", P((4, 12.5), (9.5, 18), (20, 6.5), gap=True))
icon("plus", "navigation", L(12, 4, 12, 20, gap=True), L(4, 12, 20, 12))
icon("minus", "navigation", L(4, 12, 20, 12), nogap=True)
icon("more-h", "navigation", D(5, 12, 1.6), D(12, 12, 1.6), D(19, 12, 1.6), nogap=True)
icon("more-v", "navigation", D(12, 5, 1.6), D(12, 12, 1.6), D(12, 19, 1.6), nogap=True)
icon("external-link", "navigation", P((10, 5), (5, 5), (5, 19), (19, 19), (19, 14), gap=True), L(12, 12, 20, 4), P((14, 4), (20, 4), (20, 10)))
icon("sidebar", "navigation", R(3, 4, 18, 16, gap="bottom"), L(9, 4, 9, 20))
icon("grid", "navigation", R(3.5, 3.5, 7, 7, 1.5, gap="left"), R(13.5, 3.5, 7, 7, 1.5), R(3.5, 13.5, 7, 7, 1.5), R(13.5, 13.5, 7, 7, 1.5))
icon("list", "navigation", L(9, 6, 20, 6, gap=("t", 0, 0.7)), L(9, 12, 20, 12), L(9, 18, 20, 18), D(4.5, 6), D(4.5, 12), D(4.5, 18))
icon("columns", "navigation", R(3, 4, 18, 16, gap="bottom"), L(12, 4, 12, 20))
icon("table", "navigation", R(3, 4, 18, 16, gap="left"), L(3, 9.5, 21, 9.5), L(3, 15, 21, 15), L(9.5, 9.5, 9.5, 20))
icon("minimize", "window", L(5, 12, 19, 12), nogap=True)
icon("maximize", "window", R(5, 5, 14, 14, 1.5), nogap=True)
icon("restore", "window", R(4.5, 8.5, 11, 11, 1.5), RAW("M8.5 8.5V6a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 19.5 6v8a1.5 1.5 0 0 1-1.5 1.5h-2.5"), nogap=True)
icon("grip", "navigation", *[D(x, y, 1.4) for x in (9, 15) for y in (6, 12, 18)], nogap=True)

# Actions
icon("edit", "actions", G((15.5, 4.5), (19.5, 8.5), (8, 20), (4, 20), (4, 16)), L(13, 7, 17, 11))
icon("trash", "actions", P((5.5, 6.5), (6.5, 20.5), (17.5, 20.5), (18.5, 6.5), gap=0), L(3.5, 6.5, 20.5, 6.5), P((9, 6.5), (9, 3.5), (15, 3.5), (15, 6.5)), L(10, 10.5, 10, 16.5), L(14, 10.5, 14, 16.5))
icon("copy", "actions", R(8.5, 8.5, 12.5, 12.5), RAW("M15.5 8.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h3.5"))
icon("download", "actions", P((4, 15), (4, 20), (20, 20), (20, 15), gap=True), L(12, 3.5, 12, 14.5), P((7.5, 10), (12, 14.5), (16.5, 10)))
icon("upload", "actions", P((4, 15), (4, 20), (20, 20), (20, 15), gap=True), L(12, 14.5, 12, 3.5), P((7.5, 8), (12, 3.5), (16.5, 8)))
icon("save", "actions", G((3.5, 3.5), (16.5, 3.5), (20.5, 7.5), (20.5, 20.5), (3.5, 20.5)), P((7, 20.5), (7, 14), (17, 14), (17, 20.5)), P((7.5, 3.5), (7.5, 8), (14.5, 8)))
icon("filter", "actions", G((3, 4), (21, 4), (14, 12.5), (14, 20), (10, 18), (10, 12.5)))
icon("refresh", "actions", RAW("M20 12a8 8 0 1 1-2.35-5.65"), P((18.1, 2.4), (17.7, 6.4), (13.7, 6.1)))
icon("undo", "actions", RAW("M4 9h11a5 5 0 0 1 0 10h-3M8.6 19H8"), P((8, 5), (4, 9), (8, 13)))
icon("redo", "actions", RAW("M20 9H9a5 5 0 0 0 0 10h3M15.4 19h.6"), P((16, 5), (20, 9), (16, 13)))
icon("link", "actions", RAW("M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"), RAW("M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"))
icon("share", "actions", C(6, 12, 2.6, gap=180), C(18, 5, 2.6), C(18, 19, 2.6), L(8.3, 10.7, 15.7, 6.3), L(8.3, 13.3, 15.7, 17.7))
icon("expand", "actions", P((14, 3.5), (20.5, 3.5), (20.5, 10), gap=("v", 1)), P((10, 20.5), (3.5, 20.5), (3.5, 14)), L(20.5, 3.5, 14, 10), L(3.5, 20.5, 10, 14))
icon("compress", "actions", P((4, 10), (10, 10), (10, 4), gap=("v", 1)), P((20, 14), (14, 14), (14, 20)), L(10, 10, 3.5, 3.5), L(14, 14, 20.5, 20.5))
icon("sort", "actions", L(7, 20, 7, 4, gap=("t", 0, 0.35)), P((3.5, 7.5), (7, 4), (10.5, 7.5)), L(17, 4, 17, 20), P((13.5, 16.5), (17, 20), (20.5, 16.5)))
icon("pin", "actions", P((10, 3.5), (10, 9.5), (6.5, 14), (17.5, 14), (14, 9.5), (14, 3.5), gap=2), L(8.5, 3.5, 15.5, 3.5), L(12, 14, 12, 20.5))
icon("star", "actions", G(*[(12 + (9.5 if k % 2 == 0 else 4.2) * math.cos(math.radians(-90 + k * 36)), 12.6 + (9.5 if k % 2 == 0 else 4.2) * math.sin(math.radians(-90 + k * 36))) for k in range(10)], gap=5))
icon("heart", "actions", RAW("M10.9 6.1A4.6 4.6 0 0 0 3.5 9.8C3.5 15.2 12 20.5 12 20.5s8.5-5.3 8.5-10.7a4.6 4.6 0 0 0-7.4-3.7"))
icon("bookmark", "actions", G((6, 3.5), (18, 3.5), (18, 20.5), (12, 16), (6, 20.5)))
icon("tag", "actions", G((3.5, 3.5), (12, 3.5), (20.5, 12), (12, 20.5), (3.5, 12), gap=1), D(8, 8, 1.3))
icon("flag", "actions", G((5, 4), (19, 4), (16, 9), (19, 14), (5, 14), gap=0), L(5, 4, 5, 21))
icon("zoom-in", "actions", C(10.5, 10.5, 7, gap=225), L(15.6, 15.6, 20.5, 20.5), L(10.5, 7.5, 10.5, 13.5), L(7.5, 10.5, 13.5, 10.5))
icon("zoom-out", "actions", C(10.5, 10.5, 7, gap=225), L(15.6, 15.6, 20.5, 20.5), L(7.5, 10.5, 13.5, 10.5))
icon("history", "actions", RAW("M4 12a8 8 0 1 0 2.35-5.65"), P((5, 3), (5, 7.5), (9.5, 7.5)), P((12, 8), (12, 12), (15, 14)))
icon("check-circle", "actions", C(12, 12, 9, gap=315), P((8, 12.5), (11, 15.5), (16, 9.5)))
icon("x-circle", "actions", C(12, 12, 9, gap=315), L(9, 9, 15, 15), L(15, 9, 9, 15))
icon("plus-circle", "actions", C(12, 12, 9, gap=315), L(12, 8, 12, 16), L(8, 12, 16, 12))
icon("paperclip", "actions", RAW("M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.4-2.4l7-7"))
icon("cursor", "actions", G((5, 3.5), (19, 11), (12.5, 12.5), (10, 19.5), gap=0))
icon("sparkle", "actions", G((12, 3), (13.8, 10.2), (21, 12), (13.8, 13.8), (12, 21), (10.2, 13.8), (3, 12), (10.2, 10.2), gap=4))
icon("wand", "actions", L(4, 20, 15, 9, gap=True), L(13, 7, 17, 11), RAW("M18 3v3M16.5 4.5h3M20 9v2M19 10h2"))

# Monitoring
icon("activity", "monitoring", P((3, 12), (7, 12), (10, 4), (14, 20), (17, 12), (21, 12), gap=True))
icon("bar-chart", "monitoring", L(3, 20.5, 21, 20.5, gap=("t", 0, 0.25)), L(7, 17, 7, 12), L(12, 17, 12, 5), L(17, 17, 17, 9))
icon("pie-chart", "monitoring", RAW("M20.5 14.5A9 9 0 1 1 9.5 3.4"), RAW("M13 3.1A8.5 8.5 0 0 1 20.9 11H13z"))
icon("trend-up", "monitoring", P((3, 17), (9, 11), (13, 15), (21, 7), gap=True), P((15, 7), (21, 7), (21, 13)))
icon("trend-down", "monitoring", P((3, 7), (9, 13), (13, 9), (21, 17), gap=True), P((15, 17), (21, 17), (21, 11)))
icon("alert-triangle", "monitoring", G((12, 3.5), (21.5, 20), (2.5, 20)), L(12, 9, 12, 13.5), D(12, 16.8))
icon("alert-circle", "monitoring", C(12, 12, 9, gap=135), L(12, 7.5, 12, 12.5), D(12, 16))
icon("info", "monitoring", C(12, 12, 9, gap=135), L(12, 11, 12, 16.5), D(12, 7.8))
icon("help", "monitoring", C(12, 12, 9, gap=135), RAW("M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"), D(12, 17))
icon("clock", "monitoring", C(12, 12, 9, gap=135), P((12, 7), (12, 12), (15.5, 14)))
icon("calendar", "monitoring", R(3.5, 5, 17, 15.5, gap="bottom"), L(3.5, 10, 20.5, 10), L(8, 3, 8, 7), L(16, 3, 16, 7))
icon("hourglass", "monitoring", G((6, 3.5), (18, 3.5), (6, 20.5), (18, 20.5), gap=0), nogap=False)
icon("zap", "monitoring", G((13, 2.5), (4.5, 13.5), (11.5, 13.5), (10.5, 21.5), (19.5, 10.5), (12.5, 10.5)))
icon("target", "monitoring", C(12, 12, 9, gap=315), C(12, 12, 4.5), D(12, 12, 1.3))
icon("loader", "monitoring", RAW("M12 3a9 9 0 1 1-9 9"))
icon("radar", "monitoring", C(12, 12, 9, gap=315), RAW("M12 7a5 5 0 1 0 5 5"), L(12, 12, 17.5, 6.5), D(12, 12, 1.3))

# Security
icon("shield", "security", RAW("M4.5 9.4v2.1C4.5 17.5 12 21 12 21s7.5-3.5 7.5-9.5V5.5L12 3 4.5 5.5v.5"))
icon("shield-check", "security", RAW("M4.5 9.4v2.1C4.5 17.5 12 21 12 21s7.5-3.5 7.5-9.5V5.5L12 3 4.5 5.5v.5"), P((9, 12), (11, 14), (15, 10)))
icon("shield-alert", "security", RAW("M4.5 9.4v2.1C4.5 17.5 12 21 12 21s7.5-3.5 7.5-9.5V5.5L12 3 4.5 5.5v.5"), L(12, 8, 12, 12.5), D(12, 15.8))
icon("lock", "security", R(4.5, 10.5, 15, 10.5, gap="bottom"), RAW("M8 10.5V7.5a4 4 0 0 1 8 0v3"), L(12, 14.5, 12, 16.5))
icon("unlock", "security", R(4.5, 10.5, 15, 10.5, gap="bottom"), RAW("M8 10.5V7.5a4 4 0 0 1 7.8-1.3"), L(12, 14.5, 12, 16.5))
icon("key", "security", C(7.5, 15.5, 4, gap=315), L(10.5, 12.5, 20, 3), L(16.5, 6.5, 19, 9), L(14, 9, 16, 11))
icon("fingerprint", "security", RAW("M7 4.8A8.5 8.5 0 0 1 20.5 12v1M3.5 15.5V12a8.5 8.5 0 0 1 1.3-4.5M8 20a13 13 0 0 1-1.5-6v-2a5.5 5.5 0 0 1 11 0v2M12 11.5V14a9 9 0 0 0 2.5 6.3M17.5 18.5a13 13 0 0 0 .4-2.5"))
icon("eye", "security", RAW("M10.3 5.6C5.4 6.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5 9.5-6.5 9.5-6.5-2.9-5.7-7.8-6.4"), C(12, 12, 3))
icon("eye-off", "security", RAW("M10.3 5.6C5.4 6.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5 9.5-6.5 9.5-6.5-2.9-5.7-7.8-6.4"), C(12, 12, 3), L(4, 4, 20, 20))
icon("scan", "security", L(3.5, 12, 20.5, 12, gap=True), P((3.5, 8), (3.5, 3.5), (8, 3.5)), P((16, 3.5), (20.5, 3.5), (20.5, 8)), P((20.5, 16), (20.5, 20.5), (16, 20.5)), P((8, 20.5), (3.5, 20.5), (3.5, 16)))
icon("firewall", "security", R(3, 4, 18, 16, 1.5, gap="left"), L(3, 9.3, 21, 9.3), L(3, 14.7, 21, 14.7), L(9, 4, 9, 9.3), L(15, 4, 15, 9.3), L(12, 9.3, 12, 14.7), L(9, 14.7, 9, 20), L(15, 14.7, 15, 20))
icon("bug", "security", R(7, 7.5, 10, 13, 5, gap="left"), RAW("M9 7.5a3 3 0 0 1 6 0"), L(3.5, 11, 7, 12), L(3.5, 15.5, 7, 15.5), L(3.5, 20, 7, 18.5), L(20.5, 11, 17, 12), L(20.5, 15.5, 17, 15.5), L(20.5, 20, 17, 18.5))
icon("hash", "security", L(4, 9, 20, 9, gap=("t", 0, 0.75)), L(4, 15, 20, 15), L(10, 3.5, 8, 20.5), L(16, 3.5, 14, 20.5))

# Infrastructure / data
icon("server", "data", R(3.5, 3.5, 17, 7.5), R(3.5, 13, 17, 7.5), D(7.5, 7.25), D(7.5, 16.75))
icon("database", "data", RAW("M4 6a8 2.8 0 1 0 16 0 8 2.8 0 1 0-16 0"), RAW("M4 6v6.9M4 16.3V18c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V6"), RAW("M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"))
icon("cloud", "data", RAW("M10.4 18.5h7.1a4 4 0 0 0 .5-8 6 6 0 0 0-11.6-1.5A4.5 4.5 0 0 0 7 18.5h.3"))
icon("cloud-upload", "data", RAW("M8 18.5H7a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 11a4 4 0 0 1-.5 7.5H16"), L(12, 20.5, 12, 12), P((9, 15), (12, 12), (15, 15)))
icon("cloud-download", "data", RAW("M8 17.5H7a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10a4 4 0 0 1-.5 7.5H16"), L(12, 11.5, 12, 20.5), P((9, 17.5), (12, 20.5), (15, 17.5)))
icon("globe", "data", C(12, 12, 9, gap=315), RAW("M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9c2.5-2.5 3.8-5.5 3.8-9S14.5 5.5 12 3"), L(3, 12, 21, 12))
icon("cpu", "data", R(6, 6, 12, 12, gap="left"), R(9.5, 9.5, 5, 5, 0.8), *[L(*c) for c in [(9.5, 2.5, 9.5, 6), (14.5, 2.5, 14.5, 6), (9.5, 18, 9.5, 21.5), (14.5, 18, 14.5, 21.5), (18, 9.5, 21.5, 9.5), (18, 14.5, 21.5, 14.5), (2.5, 14.5, 6, 14.5)]])
icon("hard-drive", "data", R(3, 13, 18, 7.5, gap="bottom"), P((3, 13), (6, 4.5), (18, 4.5), (21, 13)), D(7, 16.75))
icon("network", "data", R(9, 2.5, 6, 5, 1, gap="top"), R(2.5, 16.5, 6, 5, 1), R(15.5, 16.5, 6, 5, 1), P((5.5, 16.5), (5.5, 12), (18.5, 12), (18.5, 16.5)), L(12, 7.5, 12, 12))
icon("terminal", "data", R(2.5, 4, 19, 16, gap="bottom"), P((6.5, 9), (10, 12), (6.5, 15)), L(12, 15, 17, 15))
icon("code", "data", L(14, 4, 10, 20, gap=True), P((8, 6.5), (2.5, 12), (8, 17.5)), P((16, 6.5), (21.5, 12), (16, 17.5)))
icon("wifi", "data", RAW("M2 8.8a15 15 0 0 1 20 0M5.2 12.3a10 10 0 0 1 13.6 0M8.5 15.8a5 5 0 0 1 7 0"), D(12, 19.2, 1.3))
icon("router", "data", R(2.5, 13, 19, 7.5, gap="bottom"), D(6.5, 16.75), D(10, 16.75), L(16, 13, 19, 6.5))
icon("api", "data", RAW("M8 3.5H7a2 2 0 0 0-2 2V10l-2 2 2 2v4.5a2 2 0 0 0 2 2h1M16 3.5h1a2 2 0 0 1 2 2V10l2 2-2 2v4.5a2 2 0 0 1-2 2h-1"), D(9, 12), D(12, 12), D(15, 12))
icon("package", "data", G((12, 2.5), (20.5, 7), (20.5, 17), (12, 21.5), (3.5, 17), (3.5, 7), gap=4), P((3.5, 7), (12, 11.5), (20.5, 7)), L(12, 11.5, 12, 21.5))
icon("git-branch", "data", L(6, 7.5, 6, 16.5, gap=False), C(6, 5, 2.3, gap=False), C(6, 19, 2.3, gap=90), C(18, 6.5, 2.3), RAW("M18 8.8c0 4.8-6 5.2-10.5 8.4"))
icon("git-commit", "data", C(12, 12, 3.8, gap=270), L(2.5, 12, 8.2, 12), L(15.8, 12, 21.5, 12))
icon("git-merge", "data", C(6, 5, 2.3, gap=False), C(6, 19, 2.3), C(18, 15, 2.3, gap=0), L(6, 7.3, 6, 16.7), RAW("M6 7.3c0 4.5 3.5 7.7 9.7 7.7"))
icon("bot", "data", R(4, 8, 16, 12, 3, gap="bottom"), L(12, 8, 12, 4.5), D(12, 3.8, 1.3), D(9, 13.5, 1.4), D(15, 13.5, 1.4), L(2, 12.5, 2, 15.5), L(22, 12.5, 22, 15.5))

# Documents
icon("document", "documents", G((5, 3), (14, 3), (19, 8), (19, 21), (5, 21), gap=4), P((14, 3), (14, 8), (19, 8)))
icon("file-text", "documents", G((5, 3), (14, 3), (19, 8), (19, 21), (5, 21), gap=4), P((14, 3), (14, 8), (19, 8)), L(8.5, 12.5, 15.5, 12.5), L(8.5, 16.5, 15.5, 16.5))
icon("file-plus", "documents", G((5, 3), (14, 3), (19, 8), (19, 21), (5, 21), gap=4), P((14, 3), (14, 8), (19, 8)), L(12, 11.5, 12, 17.5), L(9, 14.5, 15, 14.5))
icon("file-code", "documents", G((5, 3), (14, 3), (19, 8), (19, 21), (5, 21), gap=4), P((14, 3), (14, 8), (19, 8)), P((10, 12), (8, 14.5), (10, 17)), P((14, 12), (16, 14.5), (14, 17)))
icon("folder", "documents", G((3, 19.5), (3, 5), (9, 5), (11, 7.5), (21, 7.5), (21, 19.5), gap=5))
icon("folder-open", "documents", G((3, 19.5), (3, 5), (9, 5), (11, 7.5), (19, 7.5), (19, 10.5), gap=0), P((3, 19.5), (6.5, 10.5), (22, 10.5), (18.5, 19.5), (3, 19.5)))
icon("folder-plus", "documents", G((3, 19.5), (3, 5), (9, 5), (11, 7.5), (21, 7.5), (21, 19.5), gap=5), L(12, 10.5, 12, 16.5), L(9, 13.5, 15, 13.5))
icon("clipboard", "documents", R(5, 4.5, 14, 16.5, gap="left"), R(8.5, 2.5, 7, 4, 1))
icon("log", "documents", R(4.5, 3, 15, 18, gap="left"), L(8, 8, 16, 8), L(8, 12, 16, 12), L(8, 16, 13, 16))
icon("archive", "documents", P((5, 9), (5, 20), (19, 20), (19, 9), gap=1), R(3, 4, 18, 5, 1), L(10, 13, 14, 13))
icon("inbox", "documents", P((3, 13), (3, 19.5), (21, 19.5), (21, 13), gap=1), P((3, 13), (6, 4.5), (18, 4.5), (21, 13)), P((3, 13), (8, 13), (9.5, 15.5), (14.5, 15.5), (16, 13), (21, 13)))
icon("image", "documents", R(3, 4, 18, 16, gap="left"), C(8.5, 9.5, 1.8), P((21, 15), (16, 10), (5, 20)))

# Media
icon("play", "media", G((5.5, 3.5), (20, 12), (5.5, 20.5), gap=2))
icon("pause", "media", R(5.5, 4, 4.5, 16, 1.5, gap="left"), R(14, 4, 4.5, 16, 1.5))
icon("stop", "media", R(4.5, 4.5, 15, 15, gap="left"))
icon("skip-forward", "media", G((4, 4.5), (15, 12), (4, 19.5), gap=2), L(19, 4.5, 19, 19.5))
icon("skip-back", "media", G((20, 4.5), (9, 12), (20, 19.5), gap=2), L(5, 4.5, 5, 19.5))
icon("fast-forward", "media", G((3, 5), (11.5, 12), (3, 19), gap=2), G((12, 5), (20.5, 12), (12, 19), gap=False))
icon("rewind", "media", G((21, 5), (12.5, 12), (21, 19), gap=2), G((12, 5), (3.5, 12), (12, 19), gap=False))
icon("volume", "media", G((3.5, 9), (7.5, 9), (12.5, 4.5), (12.5, 19.5), (7.5, 15), (3.5, 15), gap=3), RAW("M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"))
icon("volume-low", "media", G((3.5, 9), (7.5, 9), (12.5, 4.5), (12.5, 19.5), (7.5, 15), (3.5, 15), gap=3), RAW("M16 9a4 4 0 0 1 0 6"))
icon("volume-mute", "media", G((3.5, 9), (7.5, 9), (12.5, 4.5), (12.5, 19.5), (7.5, 15), (3.5, 15), gap=3), L(16, 9.5, 21, 14.5), L(21, 9.5, 16, 14.5))
icon("fullscreen", "media", P((3.5, 8.5), (3.5, 3.5), (8.5, 3.5)), P((15.5, 3.5), (20.5, 3.5), (20.5, 8.5)), P((20.5, 15.5), (20.5, 20.5), (15.5, 20.5)), P((8.5, 20.5), (3.5, 20.5), (3.5, 15.5)), nogap=True)
icon("record", "media", C(12, 12, 8.5, gap=315), D(12, 12, 3.8))
icon("camera", "media", G((3, 7), (7.5, 7), (9, 4.5), (15, 4.5), (16.5, 7), (21, 7), (21, 19.5), (3, 19.5), gap=6), C(12, 13, 3.5))
icon("cctv", "media", G((3, 4.5), (16, 8), (14.5, 13.5), (1.5, 10), gap=0), L(15.2, 10.9, 21, 12.4), L(21, 8.5, 21, 16.5))
icon("pip", "media", R(2.5, 4, 19, 16, gap="left"), R(12, 11.5, 7, 6, 1))
icon("subtitles", "media", R(2.5, 5, 19, 14, gap="top"), L(6, 12.5, 10, 12.5), L(12.5, 12.5, 18, 12.5), L(6, 15.5, 14, 15.5))
icon("mic", "media", R(9, 3, 6, 11, 3, gap="left"), RAW("M5.5 11a6.5 6.5 0 0 0 13 0"), L(12, 17.5, 12, 21))
icon("screen-share", "media", R(2.5, 4, 19, 13, gap="bottom"), L(8, 21, 16, 21), L(12, 17, 12, 21), L(12, 13.5, 12, 7.5), P((9, 10), (12, 7), (15, 10)))
icon("music", "media", P((9, 18), (9, 5), (20, 3), (20, 16), gap=0), C(6.5, 18, 2.5), C(17.5, 16, 2.5))
icon("video", "media", R(2.5, 6, 13, 12, gap="top"), G((15.5, 10.5), (21.5, 7), (21.5, 17), (15.5, 13.5), gap=False))
icon("repeat", "media", RAW("M3.5 11.5V10a4 4 0 0 1 4-4h2.5M13.5 6h7M3.5 18h13a4 4 0 0 0 4-4v-1.5"), P((17.5, 3), (20.5, 6), (17.5, 9)), P((6.5, 15), (3.5, 18), (6.5, 21)))
icon("shuffle", "media", RAW("M3 6.5h3.5c4.5 0 6.5 11 11 11H21M3 17.5h3.5c1.8 0 3.1-1.7 4.2-3.8M13.3 10.3c1.1-2.1 2.4-3.8 4.2-3.8H21"), P((18, 3.5), (21, 6.5), (18, 9.5)), P((18, 14.5), (21, 17.5), (18, 20.5)))

# Devices & utility
icon("power", "utility", RAW("M7 5.8a8 8 0 1 0 10 0"), L(12, 2.5, 12, 11))
icon("mail", "utility", R(2.5, 5, 19, 14, gap="bottom"), P((2.5, 6.5), (12, 13), (21.5, 6.5)))
icon("phone", "utility", RAW("M5 3.5h3.5L10 8 7.7 9.5a11 11 0 0 0 6.8 6.8l1.5-2.3 4.5 1.5V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2"))
icon("send", "utility", G((21.5, 2.5), (14.5, 21.5), (10.5, 13.5), (2.5, 9.5), gap=0), L(21.5, 2.5, 10.5, 13.5))
icon("message", "utility", G((3.5, 4), (20.5, 4), (20.5, 16.5), (10, 16.5), (5, 20.5), (5, 16.5), (3.5, 16.5), gap=0))
icon("map", "utility", G((3, 6), (9, 3.5), (15, 6), (21, 3.5), (21, 18), (15, 20.5), (9, 18), (3, 20.5), gap=7), L(9, 3.5, 9, 18), L(15, 6, 15, 20.5))
icon("layers", "utility", G((12, 3), (21.5, 8), (12, 13), (2.5, 8), gap=0), P((2.5, 12), (12, 17), (21.5, 12)), P((2.5, 16), (12, 21), (21.5, 16)))
icon("toggle", "utility", R(2.5, 7, 19, 10, 5, gap="bottom"), C(16, 12, 2.8))
icon("keyboard", "utility", R(2.5, 6, 19, 12, gap="left"), *[D(x, 10) for x in (7, 10.3, 13.7, 17)], L(8, 14.5, 16, 14.5))
icon("monitor", "utility", R(2.5, 4, 19, 13, gap="bottom"), L(8, 21, 16, 21), L(12, 17, 12, 21))
icon("smartphone", "utility", R(6.5, 2.5, 11, 19, 2.5, gap="left"), L(11, 18.5, 13, 18.5))
icon("plug", "utility", R(6, 7.5, 12, 7, 2, gap="bottom"), L(9.5, 3, 9.5, 7.5), L(14.5, 3, 14.5, 7.5), RAW("M12 14.5v2.5a3 3 0 0 0 3 3h3"))
icon("sun", "utility", C(12, 12, 4, gap=315), *[L(12 + 7 * math.cos(math.radians(a)), 12 + 7 * math.sin(math.radians(a)), 12 + 9.2 * math.cos(math.radians(a)), 12 + 9.2 * math.sin(math.radians(a))) for a in range(0, 360, 45)])
icon("moon", "utility", RAW("M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5"))

# ---------------------------------------------------------------- emit
def render(name):
    cat, shapes, nogap = ICONS[name]
    explicit = any(getattr(s, "gap", None) not in (None, False) for s in shapes)
    parts, dots, gapped = [], [], explicit or nogap
    for s in shapes:
        if isinstance(s, Dot):
            dots.append(s.el()); continue
        if not gapped and s.can_gap and getattr(s, "gap", None) is None:
            parts.append(s.svg(gap=True)); gapped = True
        else:
            parts.append(s.svg(gap=False) if getattr(s, "gap", None) is None else s.svg())
    body = "".join(f'<path d="{d}"/>' for d in parts) + "".join(dots)
    return cat, body

def pascal(n): return "".join(w.capitalize() for w in n.split("-"))

ATTR = f'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round"'

def main():
    out = {k: os.path.join(HERE, k) for k in ("svg", "react", "qt")}
    for p in out.values(): os.makedirs(p, exist_ok=True)
    manifest, sprite, react = [], [], []
    for name in ICONS:
        cat, body = render(name)
        with open(os.path.join(out["svg"], f"{name}.svg"), "w", newline="\n") as f:
            f.write(f"<svg {ATTR}>{body}</svg>\n")
        sprite.append(f'<symbol id="vwsq-{name}" viewBox="0 0 24 24">{body}</symbol>')
        comp = "Icon" + pascal(name)
        jsx = body.replace("stroke-width", "strokeWidth")
        react.append(f"export const {comp} = (p: IconProps) => <Svg {{...p}}>{jsx}</Svg>;")
        manifest.append({"name": name, "component": comp, "category": cat})
    with open(os.path.join(HERE, "sprite.svg"), "w", newline="\n") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" fill="none" stroke="currentColor" '
                f'stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round">\n' + "\n".join(sprite) + "\n</svg>\n")
    with open(os.path.join(out["react"], "index.tsx"), "w", newline="\n") as f:
        f.write("""// GENERATED by icons/build.py. Do not edit; change build.py and re-run.
import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  /** Rendered width and height in px. Default 20. */
  size?: number | string;
  /** Accessible name. Omit for decorative icons (aria-hidden is then set). */
  title?: string;
}

const Svg = ({ size = 20, title, children, ...rest }: IconProps & { children?: React.ReactNode }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={%d} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...rest}>
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

""" % STROKE + "\n".join(react) + "\n\nexport const iconNames = " + json.dumps([m["name"] for m in manifest]) + " as const;\nexport type IconName = typeof iconNames[number];\n")
    with open(os.path.join(out["qt"], "vwsq_icons.qrc"), "w", newline="\n") as f:
        f.write('<!DOCTYPE RCC>\n<RCC version="1.0">\n  <qresource prefix="/vwsq">\n' +
                "\n".join(f'    <file alias="{m["name"]}.svg">../svg/{m["name"]}.svg</file>' for m in manifest) +
                "\n  </qresource>\n</RCC>\n")
    with open(os.path.join(HERE, "icons.json"), "w", newline="\n") as f:
        json.dump({"stroke": STROKE, "viewBox": "0 0 24 24", "icons": manifest}, f, indent=1)
    print(f"{len(manifest)} icons")

if __name__ == "__main__":
    main()
