"""Batches of solved problems still lacking an 'insight' (how to come up with the solution)."""
import json, glob, os, html, re
ROOT = os.path.join(os.path.dirname(__file__), "..")
os.chdir(ROOT)
os.makedirs("insights", exist_ok=True); os.makedirs("raw/insight_batches", exist_ok=True)
for f in glob.glob("raw/insight_batches/*.json"): os.remove(f)
have = set()
for f in glob.glob("insights/*.json"):
    have |= set(json.load(open(f, encoding="utf-8")))
st = {}
for t in json.load(open("raw/olympiads_all.json", encoding="utf-8")):
    for p in t["problems"]:
        s = re.sub(r"<br\s*/?>|</p>", "\n", p["statement"]); s = html.unescape(re.sub(r"<[^>]+>", "", s))
        st[f"m{t['oid']}-{p['num']}"] = s.strip()
todo = []
for f in sorted(glob.glob("annotations/*.json")):
    for a in json.load(open(f, encoding="utf-8")):
        if a.get("solution") and a["id"] not in have and a.get("topic") != "geometry":
            todo.append(dict(id=a["id"], statement=st.get(a["id"], ""), skills=a.get("skills", []), hints=a.get("hints", []), solution=a["solution"]))
for i in range(0, len(todo), 20):
    json.dump(todo[i:i + 20], open(f"raw/insight_batches/{i // 20:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(todo), "problems,", (len(todo) + 19) // 20, "batches")
