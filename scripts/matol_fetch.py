"""Cached HTTP fetch for matol.kz pages (raw/cache)."""
import os, re, sys, time
import urllib.request

BASE = "https://matol.kz"
CACHE = os.path.join(os.path.dirname(__file__), "..", "raw", "cache")
os.makedirs(CACHE, exist_ok=True)


def get(path):
    fn = os.path.join(CACHE, re.sub(r"[^a-z0-9]+", "_", path) + ".html")
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    for attempt in range(5):
        try:
            req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0"})
            t = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "ignore")
            open(fn, "w", encoding="utf-8").write(t)
            return t
        except Exception as e:
            time.sleep(2 ** attempt)
    print("FAILED", path, file=sys.stderr)
    return ""
