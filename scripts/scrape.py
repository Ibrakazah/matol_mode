"""Scrape selected math olympiads (2010+) from matol.kz into raw/problems.json."""
import json, re, sys, time, html, os
from concurrent.futures import ThreadPoolExecutor
import urllib.request

BASE = "https://matol.kz"
OUT = os.path.join(os.path.dirname(__file__), "..", "raw")
CACHE = os.path.join(OUT, "cache")
os.makedirs(CACHE, exist_ok=True)
MIN_YEAR = 2010


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


def links(t, kind):
    return [(int(i), re.sub(r"<[^>]+>|\s+", " ", x).strip())
            for i, x in re.findall(r'href="/%s/(\d+)"[^>]*>(.*?)</a>' % kind, t, re.S)]


def year_of(label):
    m = re.findall(r"(\d{4})", label)
    return int(m[-1]) if m else None


# competition -> list of (olympiad_id, year, grade)
targets = []
# Republican: regional (12), final (13); year nodes -> grade olympiads
for stage_node, stage in [(12, "region"), (13, "final")]:
    for nid, label in links(get(f"/nodes/{stage_node}"), "nodes"):
        y = year_of(label)
        if not y or "учебный" not in label or y < MIN_YEAR + 1:
            continue
        for oid, gl in links(get(f"/nodes/{nid}"), "olympiads"):
            g = re.search(r"(\d+)\s*класс", gl)
            if g and int(g.group(1)) >= 9:
                targets.append(dict(oid=oid, comp=f"resp-{stage}", year=y, grade=int(g.group(1)), label=gl))
for node, comp in [(98, "izho"), (93, "silk"), (94, "apmo"), (107, "bmo"), (108, "jbmo")]:
    for oid, label in links(get(f"/nodes/{node}"), "olympiads"):
        y = year_of(label)
        if y and y >= MIN_YEAR:
            targets.append(dict(oid=oid, comp=comp, year=y, grade=None, label=label))

seen = set(); targets = [t for t in targets if not (t["oid"] in seen or seen.add(t["oid"]))]
print(len(targets), "olympiad pages", file=sys.stderr)


def clean(s):
    s = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    s = s.replace("&nbsp;", " ")
    s = re.sub(r'src="/', 'src="https://matol.kz/', s)
    return s.strip()


def parse_olympiad(t):
    page = get(f"/olympiads/{t['oid']}")
    title = re.search(r"<h2>(.*?)</h2>", page, re.S)
    t["title"] = html.unescape(re.sub(r"\s+", " ", title.group(1)).strip()) if title else t["label"]
    main = page.split('<ol class="breadcrumb">', 1)[-1]
    # problems: <b>Задача №N.</b> ... up to comment link
    parts = re.split(r"<b>\s*Задача\s*№\s*([\w.\-]+?)\.?\s*</b>", main)
    probs = []
    section = None
    for i in range(1, len(parts), 2):
        num = parts[i]
        body = parts[i + 1]
        cm = re.search(r'href="/comments/(\d+)/show"[^>]*>комментарий/решение\((\d+)\)', body)
        stmt = body[: cm.start()] if cm else body.split("<hr", 1)[0]
        stmt = re.sub(r'<a [^>]*$', "", stmt.strip())
        stmt = re.sub(r"(<br\s*/?>\s*)+$", "", stmt.strip())
        # section headers (e.g. Day 1 / junior league) appear between problems
        probs.append(dict(num=num, statement=clean(stmt), cid=int(cm.group(1)) if cm else None,
                          ncomments=int(cm.group(2)) if cm else 0))
    t["problems"] = probs
    # league / day markers
    t["headers"] = [html.unescape(re.sub(r"<[^>]+>|\s+", " ", h)).strip()
                    for h in re.findall(r"<h[345][^>]*>(.*?)</h[345]>", main, re.S)]
    return t


def parse_comments(cid):
    page = get(f"/comments/{cid}/show")
    bodies = re.findall(r'<div class="comment-body" id="comment-(\d+)-body">(.*?)</div>\s*(?:<br\s*/?>\s*)?<div class="handle visible-xs', page, re.S)
    out = []
    for blk in re.split(r'<div class="mat-comment level', page)[1:]:
        lvl = re.match(r"(\d+)", blk)
        author = re.search(r'href="/profile/([^"]+)"', blk)
        votes = re.search(r'class="vote-number">\s*(-?\d+)', blk)
        body = re.search(r'<div class="comment-body"[^>]*>(.*?)</div>\s*<div class="handle', blk, re.S)
        if body:
            out.append(dict(level=int(lvl.group(1)) if lvl else 0,
                            author=author.group(1) if author else None,
                            votes=int(votes.group(1)) if votes else 0,
                            html=clean(body.group(1))))
    return out


with ThreadPoolExecutor(8) as ex:
    targets = list(ex.map(parse_olympiad, targets))
cids = [p["cid"] for t in targets for p in t["problems"] if p["cid"] and p["ncomments"] > 0]
print(len(cids), "comment pages", file=sys.stderr)
with ThreadPoolExecutor(8) as ex:
    comments = dict(zip(cids, ex.map(parse_comments, cids)))
for t in targets:
    for p in t["problems"]:
        p["comments"] = comments.get(p["cid"], [])
json.dump(targets, open(os.path.join(OUT, "olympiads.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(sum(len(t["problems"]) for t in targets), "problems", file=sys.stderr)
