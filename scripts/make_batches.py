"""Split raw/olympiads.json into batch files for annotation."""
import json, re, html, os
COMP = {"resp-region": "Республиканская олимпиада, областной этап", "resp-final": "Республиканская олимпиада, заключительный этап",
        "izho": "Жаутыковская олимпиада", "silk": "Шелковый путь", "apmo": "АТМО (APMO)", "bmo": "Балканская олимпиада (BMO)", "jbmo": "Юниорская Балканская (JBMO)"}


def text(h):
    h = re.sub(r"<br\s*/?>|</p>", "\n", h)
    h = re.sub(r"<img[^>]*src=\"([^\"]+)\"[^>]*>", r"[рисунок: \1]", h)
    h = html.unescape(re.sub(r"<[^>]+>", "", h))
    return re.sub(r"\n{3,}", "\n\n", h).strip()


SRC = os.environ.get("SRC", "raw/olympiads.json")
EXCLUDE = os.environ.get("EXCLUDE")
PREFIX = os.environ.get("PREFIX", "")
OUTDIR = os.environ.get("OUTDIR", "raw/batches")
d = json.load(open(SRC, encoding="utf-8"))
if EXCLUDE:
    skip = {t["oid"] for t in json.load(open(EXCLUDE, encoding="utf-8"))}
    d = [t for t in d if t["oid"] not in skip]
d.sort(key=lambda t: (t["comp"], t["year"], t["grade"] or 0))
os.makedirs(OUTDIR, exist_ok=True)
batch, n = [], 0
def flush():
    global batch, n
    if batch:
        json.dump(batch, open(f"{OUTDIR}/{PREFIX}{n:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1; batch = []
for t in d:
    for p in t["problems"]:
        com = []
        total = 0
        for c in sorted(p["comments"], key=lambda c: -c["votes"]):
            s = text(c["html"])
            if total + len(s) > 14000:
                s = s[: max(0, 14000 - total)] + " …[обрезано]"
            com.append(s); total += len(s)
            if total >= 14000: break
        batch.append(dict(id=f"m{t['oid']}-{p['num']}", olympiad=COMP[t["comp"]], year=t["year"], grade=t["grade"],
                          num=p["num"], statement=text(p["statement"]), matol_comments=com))
    if len(batch) >= 22: flush()
flush()
print(n, "batches")
