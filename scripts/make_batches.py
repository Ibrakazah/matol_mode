"""Split raw/olympiads.json into batch files for annotation."""
import json, re, html, os
COMP = {"resp-region": "Республиканская олимпиада, областной этап", "resp-final": "Республиканская олимпиада, заключительный этап",
        "izho": "Жаутыковская олимпиада", "silk": "Шелковый путь", "apmo": "АТМО (APMO)", "bmo": "Балканская олимпиада (BMO)", "jbmo": "Юниорская Балканская (JBMO)"}


def text(h):
    h = re.sub(r"<br\s*/?>|</p>", "\n", h)
    h = re.sub(r"<img[^>]*src=\"([^\"]+)\"[^>]*>", r"[рисунок: \1]", h)
    h = html.unescape(re.sub(r"<[^>]+>", "", h))
    return re.sub(r"\n{3,}", "\n\n", h).strip()


d = json.load(open("raw/olympiads.json", encoding="utf-8"))
d.sort(key=lambda t: (t["comp"], t["year"], t["grade"] or 0))
os.makedirs("raw/batches", exist_ok=True)
batch, n = [], 0
def flush():
    global batch, n
    if batch:
        json.dump(batch, open(f"raw/batches/{n:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
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
