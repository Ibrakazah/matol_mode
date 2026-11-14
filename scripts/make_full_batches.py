"""Batch the problems from raw/olympiads_full.json that have no annotation yet.

Hard series (international) go to raw/full_batches/hNN.json, the rest to eNN.json.
"""
import json, glob, os, re, html
ROOT = os.path.join(os.path.dirname(__file__), "..")
os.chdir(ROOT)
HARD = {"96", "99", "515", "170", "166", "531", "98", "94", "107", "108", "93"}
tree = {int(k): v for k, v in json.load(open("raw/tree.json", encoding="utf-8")).items()}
done = set()
for f in glob.glob("annotations/*.json"):
    done |= {a["id"] for a in json.load(open(f, encoding="utf-8"))}


def text(h):
    h = re.sub(r"<br\s*/?>|</p>", "\n", h or "")
    h = re.sub(r'<img[^>]*src="([^"]+)"[^>]*>', r"[рисунок: \1]", h)
    h = html.unescape(re.sub(r"<[^>]+>", "", h))
    return re.sub(r"\n{3,}", "\n\n", h).strip()


os.makedirs("raw/full_batches", exist_ok=True)
for f in glob.glob("raw/full_batches/*.json"):
    os.remove(f)
groups = {"h": [], "e": []}
for o in json.load(open("raw/olympiads_full.json", encoding="utf-8")):
    series = tree[int(o["comp"])]["title"] if int(o["comp"]) in tree else o["comp"]
    for p in o["problems"]:
        pid = f"m{o['oid']}-{p['num']}"
        if pid in done:
            continue
        com, total = [], 0
        for c in sorted(p["comments"], key=lambda c: -c["votes"]):
            s = text(c["html"])[: max(0, 14000 - total)]
            com.append(s); total += len(s)
            if total >= 14000:
                break
        groups["h" if o["comp"] in HARD else "e"].append(dict(
            id=pid, olympiad=series, title=o["title"], year=o["year"], grade=o["grade"], num=p["num"],
            statement=text(p["statement"]), matol_comments=com))
for g, items in groups.items():
    for i in range(0, len(items), 15):
        json.dump(items[i:i + 15], open(f"raw/full_batches/{g}{i // 15:03d}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(g, len(items), "problems,", (len(items) + 14) // 15, "batches")
