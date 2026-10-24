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

raw = json.load(open(os.path.join(ROOT, "raw", "olympiads.json"), encoding="utf-8"))
olympiads, problems = [], []
for t in raw:
    olympiads.append(dict(oid=t["oid"], comp=t["comp"], year=t["year"], grade=t["grade"], title=t["title"]))
    details = {}
    for p in t["problems"]:
        pid = f"m{t['oid']}-{p['num']}"
        a = ann.get(pid, {})
        problems.append(dict(
            id=pid, oid=t["oid"], num=p["num"], st=p["statement"],
            topic=a.get("topic"), sub=a.get("subtopics", []), diff=a.get("difficulty"),
            skills=[s["name"] for s in a.get("skills", [])],
            src=a.get("solution_source"), conf=a.get("confidence"),
            nc=len(p["comments"]),
        ))
        details[pid] = dict(
            skills=a.get("skills", []), hints=a.get("hints", []), solution=a.get("solution", ""),
            answer=a.get("answer"), comments=[dict(author=c["author"], votes=c["votes"], level=c["level"], html=c["html"]) for c in p["comments"]],
            cid=p["cid"],
        )
    json.dump(details, open(os.path.join(OUT, "o", f"{t['oid']}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

json.dump(dict(comps=COMPS, olympiads=olympiads, problems=problems), open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print(len(problems), "problems,", sum(1 for p in problems if p["topic"]), "annotated")
