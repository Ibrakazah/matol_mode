"""Scrape every olympiad of the matol.kz math tree (raw/tree.json) in Russian and Kazakh.

Writes raw/olympiads_full.json: [{oid, comp, path, year, grade, title, title_kz, problems: [...]}],
where comp is the series node (second level under 'Математика') and path the chain of node ids.
"""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from matol_parse import parse_olympiad, parse_comments

RAW = os.path.join(os.path.dirname(__file__), "..", "raw")
tree = {int(k): v for k, v in json.load(open(os.path.join(RAW, "tree.json"), encoding="utf-8")).items()}

parent = {}
for n in tree.values():
    for c in n["children"]:
        parent.setdefault(c, n["id"])


def path_of(nid):
    p = [nid]
    while p[-1] in parent and p[-1] not in (171, 421):
        p.append(parent[p[-1]])
    return list(reversed(p))


targets, labels = {}, {}
for n in tree.values():
    for o in n["olympiads"]:
        targets.setdefault(o["oid"], n["id"])
        labels.setdefault(o["oid"], o["title"])


def series(path):
    if path[0] == 421:
        return path[0]
    return path[2] if len(path) > 2 else path[-1]


def year_of(*labels):
    for label in labels:
        m = re.findall(r"(19\d\d|20\d\d)", label or "")
        if m:
            return int(m[-1])
    return None


def grade_of(label):
    m = re.search(r"(\d+)\s*(?:класс|сынып)", label or "")
    return int(m.group(1)) if m else None


def one(item):
    oid, nid = item
    title, probs = parse_olympiad(oid)
    title_kz, probs_kz = parse_olympiad(oid, "kz")
    kz = {p["num"]: p["statement"] for p in probs_kz}
    for p in probs:
        p["statement_kz"] = kz.get(p["num"], "")
    path = path_of(nid)
    node_titles = [tree[x]["title"] for x in path if x in tree]
    return dict(oid=oid, comp=str(series(path)), path=path, year=year_of(title, labels.get(oid), *reversed(node_titles)),
                grade=grade_of(title), title=title or labels.get(oid, ""), title_kz=title_kz, problems=probs)


with ThreadPoolExecutor(8) as ex:
    olys = list(ex.map(one, sorted(targets.items())))
cids = sorted({p["cid"] for o in olys for p in o["problems"] if p["cid"] and p["ncomments"] > 0})
print(len(olys), "olympiads,", sum(len(o["problems"]) for o in olys), "problems,", len(cids), "comment pages", file=sys.stderr)
with ThreadPoolExecutor(8) as ex:
    comments = dict(zip(cids, ex.map(parse_comments, cids)))
for o in olys:
    for p in o["problems"]:
        p["comments"] = comments.get(p["cid"], [])
json.dump(olys, open(os.path.join(RAW, "olympiads_full.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
