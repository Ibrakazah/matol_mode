"""Apply solving policy to annotations/*.json (idempotent).

- solution_source == "matol": keep.
- solution_source == "ai" and olympiad is not the regional stage of the republican olympiad:
  move solution/hints/skills to ai_draft (hidden on the site), clear public fields.
- geometry: never has solution/hints/skills.
"""
import json, glob, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
comp = {}
for t in json.load(open(os.path.join(ROOT, "raw", "olympiads_all.json"), encoding="utf-8")):
    for p in t["problems"]:
        comp[f"m{t['oid']}-{p['num']}"] = t["comp"]

changed = 0
for f in sorted(glob.glob(os.path.join(ROOT, "annotations", "*.json"))):
    data = json.load(open(f, encoding="utf-8"))
    dirty = False
    for a in data:
        strip = a.get("topic") == "geometry" or (a.get("solution_source") == "ai" and comp.get(a["id"]) != "resp-region")
        if strip and (a.get("solution") or a.get("hints") or a.get("skills")):
            if a.get("topic") != "geometry":
                a["ai_draft"] = {k: a.get(k) for k in ("skills", "hints", "solution", "answer", "confidence")}
            a.update(skills=[], hints=[], solution="", answer=None, solution_source="none", confidence="low")
            dirty = True; changed += 1
    if dirty:
        json.dump(data, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("stripped", changed, "problems")
