"""Build public/data/prep.json: study plan for the regional olympiad (11th grade), week by week.

Problems for each unit come from theory.json topic lists: regional stage (comp 12) first, then easy
final-stage problems (comp 13, difficulty <= 5). The last regional papers are kept back as mock exams.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
D = os.path.join(ROOT, "public", "data")
idx = json.load(open(os.path.join(D, "index.json"), encoding="utf-8"))
theory = {t["id"]: t for t in json.load(open(os.path.join(D, "theory.json"), encoding="utf-8"))}
oly = {o["oid"]: o for o in idx["olympiads"]}
prob = {p["id"]: p for p in idx["problems"]}
MOCKS = [1108, 1146, 1216]  # область 11 кл. 2024, 2025, 2026

# (start, end, title, focus, theory ids, seq sections, main count, extra count)
UNITS = [
    ("17 ноя", "20 ноя", "ТЧ: делимость и сравнения по модулю",
     "Остатки, НОД, «рассмотри по модулю 3, 4, 8, 9». Самая частая тема области — начинаем с неё.",
     ["modular", "divisibility"], [], 10, 8),
    ("21 ноя", "24 ноя", "Геометрия: вписанные углы",
     "Счёт углов, вписанные четырёхугольники, признаки вписанности. База для всей геометрии.",
     ["g-inscribed"], [], 10, 6),
    ("25 ноя", "29 ноя", "ТЧ: диофантовы уравнения, квадраты, Ферма",
     "Оценки + остатки, разложение на множители, малая теорема Ферма. На области в 11 кл. почти каждый год.",
     ["diophantine", "squares", "fermat-euler", "primes"], [], 12, 8),
    ("30 ноя", "3 дек", "Геометрия: замечательные точки и биссектрисы",
     "Ортоцентр, центры вписанной и вневписанной окружностей, лемма о трезубце, середины дуг.",
     ["g-centers"], [], 10, 6),
    ("4 дек", "8 дек", "Алгебра: функциональные уравнения и многочлены",
     "Подстановки, инъективность/сюръективность, Безу и Виет. ФУ — задача №1 на области-2026.",
     ["func-eq", "polynomials"], [], 12, 8),
    ("9 дек", "12 дек", "Геометрия: подобие, касательные, степень точки",
     "Подобные треугольники, гомотетия, равные касательные, радикальная ось.",
     ["g-similarity", "g-tangent", "g-power"], [], 10, 6),
    ("13 дек", "17 дек", "Алгебра: неравенства и последовательности",
     "AM-GM, Коши–Буняковский, оценки; последовательности — раздел с разборами.",
     ["amgm", "cauchy", "ineq-methods", "sequences", "sums"], ["sets", "recur", "sums"], 12, 8),
    ("18 дек", "22 дек", "Комбинаторика: оценка + пример, Дирихле, экстремальный принцип, инварианты",
     "Как оформлять «оценка + пример»; поиск инварианта; крайний элемент.",
     ["bound-example", "pigeonhole", "extremal", "invariants"], ["comb"], 12, 8),
    ("23 дек", "26 дек", "Комбинаторика: игры, графы, раскраски",
     "Симметричная стратегия, выигрышные позиции; степени вершин; шахматная раскраска.",
     ["games", "graphs", "parity"], [], 10, 6),
    ("27 дек", "29 дек", "ТЧ+: порядок, LTE, факториалы",
     "Порядок числа по модулю, лемма о подъёме показателя — задача №6 области-2026.",
     ["lte"], ["nt", "mod"], 8, 5),
]

used = set(m for o in MOCKS for m in [o])
taken = set()


import re
seen_st = set()


def norm(p):
    return re.sub(r"\W+", "", re.sub(r"<[^>]+>", "", p["st"]))[:200]


def pool(tids):
    ids = []
    for t in tids:
        ids += [p["id"] for p in theory[t]["problems"]]
    seen, out = set(), []
    for i in ids:
        if i in seen or i in taken or i not in prob or norm(prob[i]) in seen_st:
            continue
        seen.add(i)
        out.append(prob[i])
    return out


MAT = {
    "modular": ["Генкин, Итенберг, Фомин — «Ленинградские математические кружки», главы «Делимость и остатки», «Сравнения»",
                "Андреэску, Андрика, Фен — «104 Number Theory Problems» (гл. 1–2)",
                "problems.ru — разделы «Делимость», «Сравнения по модулю»"],
    "g-inscribed": ["Прасолов — «Задачи по планиметрии», гл. 2 «Вписанный угол»",
                    "Evan Chen — «Euclidean Geometry in Mathematical Olympiads» (EGMO), гл. 1"],
    "diophantine": ["Андреэску, Андрика, Куку — «An Introduction to Diophantine Equations»",
                    "«104 Number Theory Problems» — разделы про квадраты и малую теорему Ферма",
                    "problems.ru — «Уравнения в целых числах»"],
    "g-centers": ["EGMO, гл. 1 (лемма о трезубце / Incenter–Excenter lemma) и гл. 3",
                  "Прасолов — «Задачи по планиметрии», гл. 5 «Треугольники»"],
    "func-eq": ["Evan Chen — handout «Introduction to Functional Equations» (бесплатно на его сайте)",
                "Venkatachala — «Functional Equations: A Problem Solving Approach»",
                "Прасолов — «Многочлены» (Безу, Виет, корни)"],
    "g-similarity": ["EGMO, гл. 2 (касательные, подобие) и гл. 3 (степень точки, радикальная ось)",
                     "Прасолов — «Задачи по планиметрии», гл. 1 «Подобные треугольники», гл. 3 «Окружности»"],
    "amgm": ["Evan Chen — «A Brief Introduction to Olympiad Inequalities» (бесплатный pdf)",
             "Седракян — «Неравенства. Методы доказательства»",
             "Pham Kim Hung — «Secrets in Inequalities», т. 1",
             "Раздел «Последовательности» на этом сайте"],
    "bound-example": ["Генкин, Итенберг, Фомин — главы «Принцип Дирихле», «Инварианты», «Оценка + пример»",
                      "Канель-Белов, Ковальджи — «Как решают нестандартные задачи»"],
    "games": ["Генкин, Итенберг, Фомин — главы «Игры», «Графы», «Чётность»",
              "problems.ru — разделы «Игры-шутки», «Симметричная стратегия», «Графы»"],
    "lte": ["Amir Hossein Parvardi — «Lifting The Exponent Lemma (LTE)» (бесплатный pdf)",
            "Evan Chen — handout «Orders Modulo a Prime»"],
}


def key(p):
    return (p["diff"] or 99, -oly[p["oid"]]["year"], p["id"])


recent = [p for p in idx["problems"] if oly[p["oid"]]["comp"] == "12" and str(oly[p["oid"]]["grade"]) in ("10", "11") and oly[p["oid"]]["year"] >= 2012]
units = []
for s, e, title, focus, tids, seqs, nmain, nextra in UNITS:
    ps, local = [], set()
    for p in pool(tids):
        if p.get("conf") == "high" and norm(p) not in local:
            local.add(norm(p)); ps.append(p)  # only problems whose solution passed verification
    reg = [p for p in ps if oly[p["oid"]]["comp"] == "12" and p["oid"] not in MOCKS]
    reg_hi = sorted([p for p in reg if str(oly[p["oid"]]["grade"]) in ("10", "11")], key=key)
    reg_lo = sorted([p for p in reg if str(oly[p["oid"]]["grade"]) not in ("10", "11")], key=key)
    main = (reg_hi + reg_lo)[:nmain]
    main.sort(key=key)
    fin = sorted([p for p in ps if oly[p["oid"]]["comp"] == "13" and (p["diff"] or 99) <= 6], key=key)
    rest = [p for p in reg_hi + reg_lo if p not in main]
    extra = sorted((fin[:nextra // 2 + 1] + rest)[:nextra], key=key)
    for p in main + extra:
        taken.add(p["id"])
        seen_st.add(norm(p))
    units.append(dict(start=s, end=e, title=title, focus=focus, theory=tids, seq=seqs,
                      freq=round(100 * sum(1 for p in recent if p["id"] in set().union(*[set(q["id"] for q in theory[t]["problems"]) for t in tids])) / len(recent)),
                      materials=MAT.get(tids[0], []),
                      main=[p["id"] for p in main], extra=[p["id"] for p in extra]))

mocks = [dict(oid=o, title=oly[o]["title"], when=w) for o, w in zip(MOCKS, ["30 дек", "1 янв", "3 янв"])]
json.dump(dict(units=units, mocks=mocks, nrecent=len(recent)), open(os.path.join(D, "prep.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
for u in units:
    print(u["start"], u["title"][:40], len(u["main"]), len(u["extra"]))
