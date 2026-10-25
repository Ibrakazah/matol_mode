"""Merge verify/*.json and verify_solve/*.json verdicts (run after apply_solve.py) into annotations/*.json (idempotent, non-destructive).

ok      -> mark verified
fixed   -> keep original in pre_verify, replace solution/answer, confidence medium
wrong   -> keep solution but downgrade confidence to low and show the checker's note
unsure  -> confidence at most medium
"""
import json, glob, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
verdicts = {}
for f in glob.glob(os.path.join(ROOT, "verify", "*.json")) + glob.glob(os.path.join(ROOT, "verify_solve", "*.json")):
    try:
        verdicts.update(json.load(open(f, encoding="utf-8")))
    except Exception as e:
        print("bad verify file", f, e)

stats = {}
for f in sorted(glob.glob(os.path.join(ROOT, "annotations", "*.json"))):
    data = json.load(open(f, encoding="utf-8"))
    dirty = False
    for a in data:
        v = verdicts.get(a["id"])
        if not v or not a.get("solution") or a.get("verify"):
            continue
        verdict = v.get("verdict")
        stats[verdict] = stats.get(verdict, 0) + 1
        a["verify"] = {"verdict": verdict, "note": v.get("note", "")}
        if verdict == "fixed" and v.get("solution"):
            a["pre_verify"] = {"solution": a["solution"], "answer": a.get("answer")}
            a["solution"] = v["solution"]
            if v.get("answer"):
                a["answer"] = v["answer"]
            a["confidence"] = "medium"
        elif verdict == "wrong":
            a["confidence"] = "low"
        elif verdict == "unsure" and a.get("confidence") == "high":
            a["confidence"] = "medium"
        dirty = True
    if dirty:
        json.dump(data, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(stats)
