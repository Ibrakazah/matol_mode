"""Walk the math tree on matol.kz (/nodes/171 and online olympiads /nodes/421) and save it to raw/tree.json.

Each node: {id, title, children: [node ids], olympiads: [{oid, title}]}.
"""
import json, re, os, sys, html, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from matol_fetch import get

ROOTS = [171, 421]  # math tree + online olympiads
nodes, queue, seen = {}, list(ROOTS), set(ROOTS)


def strip(x):
    return html.unescape(re.sub(r"<[^>]+>|\s+", " ", x)).strip()


def parse(nid):
    t = get(f"/nodes/{nid}")
    title = re.search(r"<title>(.*?)</title>", t, re.S)
    main = t.split('<ol class="breadcrumb">', 1)[-1]
    # breadcrumb ends at </ol>; children are links after it
    crumbs, _, body = main.partition("</ol>")
    body = body.split("Авторы задач", 1)[0]
    kids = [(int(i), strip(x)) for i, x in re.findall(r'href="/nodes/(\d+)"[^>]*>(.*?)</a>', body, re.S)]
    olys = [(int(i), strip(x)) for i, x in re.findall(r'href="/olympiads/(\d+)"[^>]*>(.*?)</a>', body, re.S)]
    return dict(id=nid, title=strip(title.group(1)) if title else str(nid),
                children=[k for k, _ in kids if k and k != nid], child_titles={k: v for k, v in kids},
                olympiads=[dict(oid=o, title=v) for o, v in olys if o])


while queue:
    batch, queue = queue, []
    with ThreadPoolExecutor(8) as ex:
        for n in ex.map(parse, batch):
            nodes[n["id"]] = n
            for c in n["children"]:
                if c not in seen and c not in (1,):
                    seen.add(c); queue.append(c)
json.dump(nodes, open(os.path.join(os.path.dirname(__file__), "..", "raw", "tree.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
olys = {o["oid"] for n in nodes.values() for o in n["olympiads"]}
print(len(nodes), "nodes,", len(olys), "olympiads")
