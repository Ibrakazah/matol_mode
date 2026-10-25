"""Merge raw/olympiads.json + annotations/*.json into public/data/ for the site."""
import json, glob, os, re

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "data")
os.makedirs(os.path.join(OUT, "o"), exist_ok=True)

COMPS = {
    "resp-region": "Республиканская олимпиада — областной этап",
    "resp-final": "Республиканская олимпиада — заключительный этап",
    "izho": "Международная Жаутыковская олимпиада",
    "silk": "Математическая олимпиада «Шелковый путь»",
    "apmo": "Азиатско-Тихоокеанская математическая олимпиада",
    "bmo": "Балканская математическая олимпиада (BMO)",
    "jbmo": "Юниорская Балканская математическая олимпиада (JBMO)",
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


raw = json.load(open(os.path.join(ROOT, "raw", "olympiads_all.json"), encoding="utf-8"))
olympiads, problems = [], []
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
for t in raw:
    olympiads.append(dict(oid=t["oid"], comp=t["comp"], year=t["year"], grade=t["grade"], title=t["title"]))
    details = {}
    for p in t["problems"]:
        pid = f"m{t['oid']}-{p['num']}"
        a = ann.get(pid, {})
        st, link_cid, au = clean_statement(p["statement"])
        problems.append(dict(
            id=pid, oid=t["oid"], num=p["num"], st=st, au=au,
            topic=a.get("topic"), sub=a.get("subtopics", []), diff=a.get("difficulty"),
            skills=[s["name"] for s in a.get("skills", [])],
            src=a.get("solution_source"), conf=a.get("confidence"),
            nc=len(p["comments"]),
        ))
        details[pid] = dict(
            skills=a.get("skills", []), hints=a.get("hints", []), solution=a.get("solution", ""),
            answer=a.get("answer"), insight=insights.get(pid, ""),
            vnote=verify_note(a), comments=[dict(author=c["author"], votes=c["votes"], level=c["level"], html=c["html"]) for c in p["comments"]],
            cid=p["cid"] or link_cid,
        )
    json.dump(details, open(os.path.join(OUT, "o", f"{t['oid']}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

json.dump(dict(comps=COMPS, olympiads=olympiads, problems=problems, authors=authors), open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print(len(problems), "problems,", sum(1 for p in problems if p["topic"]), "annotated")
