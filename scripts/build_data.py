"""Merge raw/olympiads_full.json + annotations/ + insights/ + raw/pages.json into public/data/ for the site.

Outputs:
  index.json        tree of nodes, series, olympiads, problems (Russian statements), authors
  o/<oid>.json      per-olympiad details: skills, hints, solution, insight, comments
  kz/<oid>.json     Kazakh statements and title for an olympiad
  recent.json       latest matol comments ("Последние обсуждения")
  rating.json       comment authors ranked by activity
  pages.json        info pages, news/announcements, books
"""
import json, glob, os, re, shutil

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "data")
for sub in ("o", "kz"):
    shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)

# short names for olympiad series (node ids on matol.kz)
SHORT = {
    "11": "Респа, район", "12": "Респа, область", "13": "Респа, финал", "468": "Юниорская РО",
    "98": "Жаутыковская (МЖО)", "93": "Шелковый путь", "94": "АТМО", "107": "BMO", "108": "JBMO",
    "96": "IMO", "99": "Туймаада", "170": "Западно-Китайская", "515": "EGMO", "531": "EMO",
    "67": "Олимпиада Эйлера", "166": "Иранская геометрия", "110": "Олимпиада Алматы",
    "111": "Городская Жаутыковская", "127": "Аль-Фараби", "157": "Смагулов (6–7 кл.)",
}

ann = {}
for f in sorted(glob.glob(os.path.join(ROOT, "annotations", "*.json"))):
    try:
        for a in json.load(open(f, encoding="utf-8")):
            ann[a["id"]] = a
    except Exception as e:
        print("bad annotation file", f, e)

insights = {}
for f in sorted(glob.glob(os.path.join(ROOT, "insights", "*.json"))):
    try:
        insights.update(json.load(open(f, encoding="utf-8")))
    except Exception as e:
        print("bad insight file", f, e)


def verify_note(a):
    v = a.get("verify") or {}
    if v.get("verdict") == "wrong":
        return "при проверке найдена ошибка — " + (v.get("note") or "решение может быть неверным")
    if v.get("verdict") == "fixed":
        return "решение исправлено при проверке" + (": " + v["note"] if v.get("note") else "")
    return ""


authors = {}
AUTH_RE = re.compile(r'<a[^>]*href="/authors/(\d+)"[^>]*>(.*?)</a>', re.S)
CLINK_RE = re.compile(r'(?:\s|<br\s*/?>)*<a[^>]*href="/comments/(\d+)/show"[^>]*>[^<]*</a>\s*$', re.S)


def clean_statement(st):
    """Strip the trailing matol comment link, point author links into the app."""
    cid = None
    m = CLINK_RE.search(st)
    if m:
        cid = int(m.group(1))
        st = st[: m.start()]
    au = []
    for aid, name in AUTH_RE.findall(st):
        name = re.sub(r"<[^>]+>", "", name).strip()
        authors[aid] = name
        au.append(aid)
    st = AUTH_RE.sub(lambda m: '<a class="author" href="#/author/%s">%s</a>' % (m.group(1), m.group(2)), st)
    st = re.sub(r"<a\b[^>]*$", "", st.strip())  # dangling tag cut off by the scraper
    st = re.sub(r"(\s|<br\s*/?>)+$", "", st.strip())
    return st, cid, au


def excerpt(h, n=180):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).strip()
    return t[:n] + ("…" if len(t) > n else "")


tree = {int(k): v for k, v in json.load(open(os.path.join(ROOT, "raw", "tree.json"), encoding="utf-8")).items()}
raw = json.load(open(os.path.join(ROOT, "raw", "olympiads_full.json"), encoding="utf-8"))
# which olympiad series to publish (node ids); env SERIES=all publishes everything scraped
SERIES = os.environ.get("SERIES", "12,13,98,93,94,107,108")
raw = [t for t in raw if t["problems"] and (SERIES == "all" or t["comp"] in SERIES.split(","))]
have_oly = {t["oid"] for t in raw}

nodes = {}
for n in tree.values():
    nodes[str(n["id"])] = dict(t=n["title"], c=[str(c) for c in n["children"] if c in tree],
                               o=[o["oid"] for o in n["olympiads"] if o["oid"] in have_oly],
                               l={str(o["oid"]): o["title"] for o in n["olympiads"] if o["oid"] in have_oly})

olympiads, problems, recent, rating = [], [], [], {}
for t in raw:
    olympiads.append(dict(oid=t["oid"], comp=t["comp"], path=t["path"], year=t["year"], grade=t["grade"], title=t["title"]))
    details, kz = {}, {"title": t.get("title_kz", "")}
    for p in t["problems"]:
        pid = f"m{t['oid']}-{p['num']}"
        a = ann.get(pid, {})
        st, link_cid, au = clean_statement(p["statement"])
        if p.get("statement_kz") and p["statement_kz"] != p["statement"]:
            kz[pid] = clean_statement(p["statement_kz"])[0]
        problems.append(dict(
            id=pid, oid=t["oid"], num=p["num"], st=st, au=au,
            topic=a.get("topic"), sub=a.get("subtopics", []), diff=a.get("difficulty"),
            skills=[s["name"] for s in a.get("skills", [])],
            src=a.get("solution_source"), conf=a.get("confidence"),
            nc=len(p["comments"]),
        ))
        details[pid] = dict(
            skills=a.get("skills", []), hints=a.get("hints", []), solution=a.get("solution", ""),
            answer=a.get("answer"), insight=insights.get(pid) or a.get("insight", ""),
            vnote=verify_note(a),
            comments=[dict(author=c["author"], votes=c["votes"], level=c["level"], time=c.get("time", 0), html=c["html"]) for c in p["comments"]],
            cid=p["cid"] or link_cid,
        )
        for c in p["comments"]:
            if c.get("time"):
                recent.append(dict(pid=pid, author=c["author"], time=c["time"], text=excerpt(c["html"])))
            if c["author"]:
                r = rating.setdefault(c["author"], dict(author=c["author"], n=0, votes=0, problems=set(), last=0))
                r["n"] += 1; r["votes"] += c["votes"]; r["problems"].add(pid); r["last"] = max(r["last"], c.get("time", 0))
    json.dump(details, open(os.path.join(OUT, "o", f"{t['oid']}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(kz, open(os.path.join(OUT, "kz", f"{t['oid']}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

label = {}
for n in tree.values():
    for k, v in n.get("child_titles", {}).items():
        label.setdefault(int(k), v)
for k, v in nodes.items():
    if v["t"] == "Обзор" and int(k) in label:
        v["t"] = label[int(k)]
series = {}
for t in raw:
    c = t["comp"]
    series.setdefault(c, dict(title=nodes[c]["t"] if c in nodes else c, short=SHORT.get(c) or (nodes[c]["t"] if c in nodes else c)))

json.dump(dict(nodes=nodes, series=series, olympiads=olympiads, problems=problems, authors=authors),
          open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

recent.sort(key=lambda r: -r["time"])
json.dump(recent[:150], open(os.path.join(OUT, "recent.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
rows = sorted(rating.values(), key=lambda r: (-len(r["problems"]), -r["votes"]))
for r in rows:
    r["problems"] = len(r["problems"])
json.dump(rows[:300], open(os.path.join(OUT, "rating.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

pages_path = os.path.join(ROOT, "raw", "pages.json")
if os.path.exists(pages_path):
    pages = json.load(open(pages_path, encoding="utf-8"))

    def fix(h):
        h = re.sub(r'<div[^>]*>\s*<i>\s*Дата публикации:\s*</i>[^<]*</div>', "", h)
        return re.sub(r'(href|src)="/(?!/)', r'\1="https://matol.kz/', h)

    for item in pages["info"] + pages["news"]:
        item["html"] = fix(item["html"])
    json.dump(pages, open(os.path.join(OUT, "pages.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

print(len(problems), "problems,", sum(1 for p in problems if p["topic"]), "annotated,",
      sum(1 for p in problems if p["src"] and p["src"] != "none"), "with solutions;", len(olympiads), "olympiads")
