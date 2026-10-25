"""Batches of problems that still have no solution (all topics, geometry included)."""
import json, glob, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
os.chdir(ROOT)
os.makedirs("raw/solve_batches", exist_ok=True); os.makedirs("solve", exist_ok=True)
for f in glob.glob("raw/solve_batches/*.json"):
    os.remove(f)
done = set()
for f in glob.glob("solve/*.json"):
    try:
        done |= set(json.load(open(f, encoding="utf-8")))
    except Exception:
        pass
src = {}
for f in glob.glob("raw/batches/*.json") + glob.glob("raw/batches_old/*.json"):
    for p in json.load(open(f, encoding="utf-8")):
        src[p["id"]] = p
todo = []
for f in sorted(glob.glob("annotations/*.json")):
    for a in json.load(open(f, encoding="utf-8")):
        if a.get("solution") or a["id"] in done:
            continue
        p = src[a["id"]]
        todo.append(dict(p, topic=a.get("topic"), subtopics=a.get("subtopics", []), difficulty=a.get("difficulty")))
todo.sort(key=lambda p: (p["topic"] == "geometry", p.get("difficulty") or 5))
for i in range(0, len(todo), 15):
    json.dump(todo[i:i + 15], open(f"raw/solve_batches/s{i // 15:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(todo), "problems,", (len(todo) + 14) // 15, "batches;", sum(p["topic"] == "geometry" for p in todo), "geometry")
