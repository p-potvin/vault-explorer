"""Small LAN-only-by-default XMLTV EPG proxy for TV clients.

The server fetches one configured upstream feed on demand and keeps it in
memory for a bounded cache period. It does not run a background poller.
"""

from __future__ import annotations

import gzip
import json
import os
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen


DEFAULT_SOURCE_URL = "https://iptv-epg.org/files/epg-ca.xml.gz"
MAX_FEED_BYTES = 64 * 1024 * 1024
MAX_PLAYLIST_BYTES = 8 * 1024 * 1024


class EpgCache:
    def __init__(self, source_url: str, ttl_seconds: int) -> None:
        self.source_url = source_url
        self.ttl_seconds = ttl_seconds
        self._body: bytes | None = None
        self._compressed: bytes | None = None
        self._fetched_at = 0.0
        self._lock = threading.Lock()

    @property
    def age_seconds(self) -> int | None:
        if self._body is None:
            return None
        return max(0, int(time.time() - self._fetched_at))

    def get(self) -> bytes:
        if self._body is not None and time.time() - self._fetched_at < self.ttl_seconds:
            return self._body
        with self._lock:
            if self._body is not None and time.time() - self._fetched_at < self.ttl_seconds:
                return self._body
            request = Request(
                self.source_url,
                headers={"User-Agent": "VaultExplorer-EPG/1.0"},
            )
            with urlopen(request, timeout=30) as response:
                compressed = response.read(MAX_FEED_BYTES + 1)
            if len(compressed) > MAX_FEED_BYTES:
                raise ValueError("upstream EPG exceeds the 64 MiB safety limit")
            body = gzip.decompress(compressed) if compressed[:2] == b"\x1f\x8b" else compressed
            if b"<tv" not in body[:4096]:
                raise ValueError("upstream response is not XMLTV")
            self._body = body
            self._compressed = None
            self._fetched_at = time.time()
            return body

    def get_compressed(self) -> bytes:
        body = self.get()
        if self._compressed is not None:
            return self._compressed
        with self._lock:
            if self._compressed is None:
                self._compressed = gzip.compress(body, compresslevel=6, mtime=0)
            return self._compressed


class LocalFileCache:
    def __init__(self, path: str, max_bytes: int = 256 * 1024 * 1024) -> None:
        self.path = Path(path)
        self.max_bytes = max_bytes
        self._body: bytes | None = None
        self._compressed: bytes | None = None
        self._signature: tuple[int, int] | None = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self.path.is_file()

    def get(self) -> bytes:
        stat = self.path.stat()
        signature = (stat.st_mtime_ns, stat.st_size)
        if self._body is not None and self._signature == signature:
            return self._body
        if stat.st_size > self.max_bytes:
            raise ValueError("local EPG exceeds the safety limit")
        with self._lock:
            stat = self.path.stat()
            signature = (stat.st_mtime_ns, stat.st_size)
            if self._body is not None and self._signature == signature:
                return self._body
            raw_body = self.path.read_bytes()
            body = gzip.decompress(raw_body) if raw_body[:2] == b"\x1f\x8b" else raw_body
            if b"<tv" not in body[:4096]:
                raise ValueError("local file is not XMLTV")
            self._body = body
            self._compressed = None
            self._signature = signature
            return body

    def get_compressed(self) -> bytes:
        body = self.get()
        if self._compressed is not None:
            return self._compressed
        with self._lock:
            if self._compressed is None:
                self._compressed = gzip.compress(body, compresslevel=6, mtime=0)
            return self._compressed


class PlaylistCache:
    def __init__(self, source_url: str, ttl_seconds: int) -> None:
        self.source_url = source_url
        self.ttl_seconds = ttl_seconds
        self._body: bytes | None = None
        self._fetched_at = 0.0
        self._lock = threading.Lock()

    @property
    def age_seconds(self) -> int | None:
        if self._body is None:
            return None
        return max(0, int(time.time() - self._fetched_at))

    def get(self, force_refresh: bool = False) -> bytes:
        if not force_refresh and self._body is not None and time.time() - self._fetched_at < self.ttl_seconds:
            return self._body
        with self._lock:
            if not force_refresh and self._body is not None and time.time() - self._fetched_at < self.ttl_seconds:
                return self._body
            request = Request(
                self.source_url,
                headers={"User-Agent": "VaultExplorer-EPG/1.0"},
            )
            with urlopen(request, timeout=30) as response:
                body = response.read(MAX_PLAYLIST_BYTES + 1)
            if len(body) > MAX_PLAYLIST_BYTES:
                raise ValueError("upstream playlist exceeds the 8 MiB safety limit")
            if not body.lstrip().startswith(b"#EXTM3U"):
                raise ValueError("upstream response is not an M3U playlist")
            self._body = body
            self._fetched_at = time.time()
            return body


def make_handler(
    cache: EpgCache,
    french_cache: LocalFileCache | None = None,
    playlist_cache: PlaylistCache | None = None,
):
    class EpgHandler(BaseHTTPRequestHandler):
        server_version = "VaultExplorerEPG/1.0"

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            request_url = urlsplit(self.path)
            path = request_url.path
            if path == "/health":
                self._send_json(
                    {
                        "ok": True,
                        "source": cache.source_url,
                        "cache_age_seconds": cache.age_seconds,
                        "french_file_available": french_cache.available if french_cache else False,
                        "playlist_cache_age_seconds": playlist_cache.age_seconds if playlist_cache else None,
                    }
                )
                return
            if path == "/playlist.m3u":
                if playlist_cache is None:
                    self.send_error(HTTPStatus.NOT_FOUND, "Playlist source not configured")
                    return
                try:
                    force_refresh = "1" in parse_qs(request_url.query).get("refresh", [])
                    body = playlist_cache.get(force_refresh=force_refresh)
                except Exception as exc:
                    self.send_error(HTTPStatus.BAD_GATEWAY, "Playlist source unavailable")
                    print(f"Playlist refresh failed: {type(exc).__name__}: {exc}")
                    return
                self._send_playlist(body, max_age=playlist_cache.ttl_seconds)
                return
            if path in ("/epg-fr.xml", "/epg-fr.xml.gz"):
                if french_cache is None or not french_cache.available:
                    self.send_error(HTTPStatus.NOT_FOUND, "French XMLTV file not configured")
                    return
                try:
                    compressed = path.endswith(".gz")
                    body = french_cache.get_compressed() if compressed else french_cache.get()
                except Exception as exc:
                    self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "French XMLTV file unavailable")
                    print(f"French EPG read failed: {type(exc).__name__}: {exc}")
                    return
                self._send_xml(body, max_age=3600, compressed=compressed)
                return
            if path not in ("/", "/epg.xml", "/epg.xml.gz"):
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            try:
                compressed = path.endswith(".gz")
                body = cache.get_compressed() if compressed else cache.get()
            except Exception as exc:  # keep provider details out of the response
                self.send_error(HTTPStatus.BAD_GATEWAY, "EPG source unavailable")
                print(f"EPG refresh failed: {type(exc).__name__}: {exc}")
                return
            self._send_xml(body, max_age=cache.ttl_seconds, compressed=compressed)

        def _send_xml(self, body: bytes, max_age: int, compressed: bool = False) -> None:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/gzip" if compressed else "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", f"public, max-age={max_age}")
            self.end_headers()
            self.wfile.write(body)

        def _send_playlist(self, body: bytes, max_age: int) -> None:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/x-mpegURL; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", f"public, max-age={max_age}")
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, value: dict) -> None:
            body = json.dumps(value).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args) -> None:
            print(f"{self.client_address[0]} - {fmt % args}")

    return EpgHandler


def main() -> None:
    host = os.getenv("EPG_HOST", "0.0.0.0")
    port = int(os.getenv("EPG_PORT", "8787"))
    source_url = os.getenv("EPG_SOURCE_URL", DEFAULT_SOURCE_URL)
    ttl_seconds = int(os.getenv("EPG_CACHE_SECONDS", "21600"))
    french_path = os.getenv("EPG_FRENCH_FILE", "")
    playlist_source_url = os.getenv("M3U_PLAYLIST_SOURCE_URL", "")
    if ttl_seconds < 60:
        raise SystemExit("EPG_CACHE_SECONDS must be at least 60")
    cache = EpgCache(source_url, ttl_seconds)
    french_cache = LocalFileCache(french_path) if french_path else None
    playlist_cache = PlaylistCache(playlist_source_url, ttl_seconds) if playlist_source_url else None
    server = ThreadingHTTPServer((host, port), make_handler(cache, french_cache, playlist_cache))
    print(f"Serving XMLTV EPG on http://{host}:{port}/epg.xml")
    print(f"Upstream: {source_url}")
    server.serve_forever()


if __name__ == "__main__":
    main()
