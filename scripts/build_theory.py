"""Map annotated problems to theory topics (keyword match on skills/subtopics) and merge notes.

Writes public/data/theory.json. Notes live in theory_notes/<topic id>.md (optional).
"""
import json, glob, os, re

ROOT = os.path.join(os.path.dirname(__file__), "..")
topics = json.load(open(os.path.join(ROOT, "scripts", "theory_topics.json"), encoding="utf-8"))
idx = json.load(open(os.path.join(ROOT, "public", "data", "index.json"), encoding="utf-8"))

by_topic = {t["id"]: [] for t in topics}
for p in idx["problems"]:
    if not p.get("topic"):
        continue
    hay = " ".join(p.get("skills", []) + p.get("sub", [])).lower()
    for t in topics:
        if t["area"] != p["topic"]:
            continue
        if any(k in hay for k in t["kw"]):
            by_topic[t["id"]].append(p)

out = []
for t in topics:
    probs = sorted(by_topic[t["id"]], key=lambda p: (p["diff"] or 99, p["id"]))
    note_path = os.path.join(ROOT, "theory_notes", t["id"] + ".md")
    note = open(note_path, encoding="utf-8").read() if os.path.exists(note_path) else ""
    out.append(dict(id=t["id"], area=t["area"], title=t["title"], note=note,
                    problems=[dict(id=p["id"], diff=p["diff"], has_sol=bool(p.get("src") and p["src"] != "none")) for p in probs]))
json.dump(out, open(os.path.join(ROOT, "public", "data", "theory.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({t["id"]: len(t["problems"]) for t in out})
print(sum(1 for t in out if t["note"]), "notes")
