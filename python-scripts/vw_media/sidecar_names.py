"""Where a media file's sidecar lives, and what it should be called.

Four names have been in use, written by different tools that never agreed:

    photo.jpg.json          <- canonical from now on
    photo.jpg.meta.json     <- the video family, vault-explorer's vw_media
    photo.json              <- the image family, image_tagger and the galleries
    photo.meta.json         <- rare

`photo.jpg.json` wins because it is the only one that cannot collide. Under the
stem forms, a `clip.mp4` and a `clip.jpg` in one folder both want `clip.json` —
and that is not a hypothetical, it is a video sitting next to its poster. When
it happens, one tool's record silently overwrites the other's.

So the stem forms are still *read*, because ~35,000 of them exist, but they are
read defensively: a stem-named sidecar is only accepted when no other media file
in the directory shares that stem. When two do, the sidecar is ambiguous and
belongs to neither until it has been renamed.

Nothing here touches the filesystem except to check existence, and nothing here
writes. Resolution order is deliberate: unambiguous names first, so that during
the migration a half-renamed directory still resolves correctly.

Developed in vault-commander/cli/utils/media_records/; copied verbatim into
vault-explorer and ColONEL-KFC. Re-sync from here rather than editing a copy.
"""

from __future__ import annotations

import os

# Extensions that make a file a "master" for sidecar purposes. Used only to
# detect stem collisions, so it errs on the side of including things.
MEDIA_EXTENSIONS = frozenset({
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif", ".tiff",
    ".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".flv", ".wmv", ".ts",
    ".mp3", ".wav", ".flac", ".m4a", ".aac", ".opus", ".ogg",
})


def canonical(media_path: str) -> str:
    """The name a sidecar should be written under: `<file.ext>.json`."""
    return media_path + ".json"


def candidates(media_path: str):
    """Every name a sidecar for *media_path* may legitimately have.

    Ordered by how much we trust them. The two full-name forms carry the
    master's extension and so can only refer to one file; the stem forms cannot,
    which is why they come last and are checked for collisions before use.
    """
    stem, _ = os.path.splitext(media_path)
    return [
        media_path + ".json",        # canonical
        media_path + ".meta.json",   # video family
        stem + ".json",              # image family / galleries
        stem + ".meta.json",         # rare
    ]


def stem_is_ambiguous(media_path: str) -> bool:
    """Would a stem-named sidecar here be claimed by more than one master?

    True when a sibling media file shares this file's stem — `clip.mp4` beside
    `clip.jpg`. Checked by stat rather than by listing the directory, because
    these run over tens of thousands of files and a gallery folder can hold
    thousands of entries.
    """
    stem, own_ext = os.path.splitext(media_path)
    own_ext = own_ext.lower()
    for ext in MEDIA_EXTENSIONS:
        if ext == own_ext:
            continue
        if os.path.exists(stem + ext) or os.path.exists(stem + ext.upper()):
            return True
    return False


def resolve(media_path: str):
    """Find this file's sidecar.

    Returns `(path, exists)`. When none is found, `path` is the canonical name
    so the caller can create it there — the same contract
    `image_tagger/sidecar.py` has always had, with a different default.
    """
    found = candidates(media_path)
    ambiguous = None  # computed lazily; the stat loop is the expensive part

    for index, candidate in enumerate(found):
        if not os.path.isfile(candidate):
            continue
        is_stem_form = index >= 2
        if is_stem_form:
            if ambiguous is None:
                ambiguous = stem_is_ambiguous(media_path)
            if ambiguous:
                continue  # belongs to no one until it is renamed
        return candidate, True

    return canonical(media_path), False


def existing(media_path: str):
    """Every sidecar that actually exists for this file, best first.

    More than one is a migration artefact — two tools wrote under two names —
    and the caller has to merge them rather than pick one.
    """
    return [c for c in candidates(media_path) if os.path.isfile(c)]


def is_sidecar_of(sidecar_path: str, media_path: str) -> bool:
    """Is *sidecar_path* one of the legal names for *media_path*?"""
    target = os.path.normcase(os.path.abspath(sidecar_path))
    return any(
        os.path.normcase(os.path.abspath(c)) == target
        for c in candidates(media_path)
    )


def master_for(sidecar_path: str):
    """The media path a sidecar name implies, or None if it is not a sidecar.

    The inverse of `candidates`, used when walking a directory sidecar-first.
    Only the full-name forms give an unambiguous answer; a stem form could
    belong to any master sharing the stem, so it returns the stem and lets the
    caller decide.
    """
    lower = sidecar_path.lower()
    if lower.endswith(".meta.json"):
        base = sidecar_path[: -len(".meta.json")]
    elif lower.endswith(".json"):
        base = sidecar_path[: -len(".json")]
    else:
        return None
    # `clip.mp4` -> a full-name form; no extension left -> a stem form.
    return base if os.path.splitext(base)[1] else None
