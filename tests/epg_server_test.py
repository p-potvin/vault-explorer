import gzip
import threading
import tempfile
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import urlopen

from scripts.epg_server import EpgCache, LocalFileCache, PlaylistCache, make_handler


class EpgServerTest(unittest.TestCase):
    def test_cache_decompresses_xmltv(self):
        cache = EpgCache("http://unused", 3600)
        payload = b'<?xml version="1.0"?><tv></tv>'

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, _):
                return gzip.compress(payload)

        import scripts.epg_server as module
        original = module.urlopen
        module.urlopen = lambda *_args, **_kwargs: Response()
        try:
            self.assertEqual(cache.get(), payload)
        finally:
            module.urlopen = original

    def test_health_and_epg_endpoints(self):
        cache = EpgCache("https://example.invalid/feed.xml", 3600)
        cache._body = b'<tv></tv>'
        cache._fetched_at = 1e20
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cache))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with urlopen(base + "/health") as response:
                self.assertEqual(response.status, 200)
            with urlopen(base + "/epg.xml") as response:
                self.assertEqual(response.read(), b"<tv></tv>")
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_local_french_epg_endpoint(self):
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as file:
            file.write(b"<tv><channel id='fr'><display-name>Francais</display-name></channel></tv>")
            path = file.name
        try:
            cache = EpgCache("http://unused", 3600)
            local = LocalFileCache(path)
            server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cache, local))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with urlopen(f"http://127.0.0.1:{server.server_port}/epg-fr.xml") as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn(b"Francais", response.read())
                with urlopen(f"http://127.0.0.1:{server.server_port}/epg-fr.xml.gz") as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(gzip.decompress(response.read()), b"<tv><channel id='fr'><display-name>Francais</display-name></channel></tv>")
            finally:
                server.shutdown()
                thread.join()
                server.server_close()
        finally:
            import os
            os.unlink(path)

    def test_playlist_endpoint(self):
        cache = EpgCache("http://unused", 3600)
        playlist = PlaylistCache("http://unused", 3600)
        playlist._body = b"#EXTM3U\n#EXTINF:-1 tvg-id=\"ARTV.ca\",ARTV\nhttps://example.invalid/artv\n"
        playlist._fetched_at = 1e20
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cache, playlist_cache=playlist))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urlopen(f"http://127.0.0.1:{server.server_port}/playlist.m3u") as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Content-Type"], "application/x-mpegURL; charset=utf-8")
                self.assertIn(b"ARTV.ca", response.read())
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_playlist_force_refresh_bypasses_cache(self):
        cache = PlaylistCache("http://unused", 3600)
        cache._body = b"#EXTM3U\n#EXTINF:-1,old\nhttps://example.invalid/old\n"
        cache._fetched_at = 1e20

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, _):
                return b"#EXTM3U\n#EXTINF:-1,new\nhttps://example.invalid/new\n"

        import scripts.epg_server as module
        original = module.urlopen
        module.urlopen = lambda *_args, **_kwargs: Response()
        try:
            self.assertIn(b"old", cache.get())
            self.assertIn(b"new", cache.get(force_refresh=True))
        finally:
            module.urlopen = original


if __name__ == "__main__":
    unittest.main()
