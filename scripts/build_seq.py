"""Build public/data/seq.json: the "Последовательности" study section.

Notes: seq/notes/<id>.md (00-intro.md is the overview). Problem classes: seq/classes.json {pid: section|null}.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SECTIONS = [
    ("sets", "Наборы чисел с условием", "экстремальный элемент, упорядочивание, оценки"),
    ("recur", "Рекуррентные последовательности", "формула n-го члена, замены, тригонометрия, монотонность"),
    ("nt", "Последовательности и делимость", "целость членов, НОД, взаимная простота"),
    ("mod", "Остатки и периодичность", "последние цифры, Дирихле, периодические дроби"),
    ("sums", "Суммы и телескопирование", "телескоп, оценки сумм, гармонический ряд"),
    ("comb", "Комбинаторика последовательностей", "частичные суммы, инварианты, монотонные подпоследовательности"),
]
idx = json.load(open(os.path.join(ROOT, "public", "data", "index.json"), encoding="utf-8"))
prob = {p["id"]: p for p in idx["problems"]}
classes = json.load(open(os.path.join(ROOT, "seq", "classes.json"), encoding="utf-8"))


def note(name):
    p = os.path.join(ROOT, "seq", "notes", name + ".md")
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


out = dict(intro=note("00-intro"), sections=[])
for sid, title, short in SECTIONS:
    ps = sorted((prob[i] for i, c in classes.items() if c == sid and i in prob), key=lambda p: (p["diff"] or 99, p["id"]))
    out["sections"].append(dict(id=sid, title=title, short=short, note=note(sid),
                                problems=[dict(id=p["id"], diff=p["diff"]) for p in ps]))
json.dump(out, open(os.path.join(ROOT, "public", "data", "seq.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({s["id"]: len(s["problems"]) for s in out["sections"]})
