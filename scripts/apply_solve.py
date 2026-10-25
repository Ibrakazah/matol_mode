"""Merge solve/*.json (AI solutions for problems that had none) into annotations/ and insights/."""
import json, glob, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
sol = {}
for f in glob.glob(os.path.join(ROOT, "solve", "*.json")):
    try:
        sol.update(json.load(open(f, encoding="utf-8")))
    except Exception as e:
        print("bad solve file", f, e)

insights_path = os.path.join(ROOT, "insights", "solve.json")
insights = json.load(open(insights_path, encoding="utf-8")) if os.path.exists(insights_path) else {}
n = 0
for f in sorted(glob.glob(os.path.join(ROOT, "annotations", "*.json"))):
    data = json.load(open(f, encoding="utf-8"))
    dirty = False
    for a in data:
        s = sol.get(a["id"])
        if not s or a.get("solution") or not s.get("solution"):
            continue
        a.update(skills=s.get("skills", []), hints=s.get("hints", []), solution=s["solution"],
                 answer=s.get("answer"), confidence=s.get("confidence", "low"), solution_source="ai")
        if s.get("insight"):
            insights[a["id"]] = s["insight"]
        dirty = True; n += 1
    if dirty:
        json.dump(data, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(insights, open(insights_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("merged", n, "solutions")
