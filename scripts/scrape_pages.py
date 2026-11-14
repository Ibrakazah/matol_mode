"""Scrape matol.kz content pages for the math section: info, news, announcements, books.

Writes raw/pages.json.
"""
import json, os, re, sys, html
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from matol_fetch import get
from matol_parse import clean


def text(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def main_part(page):
    m = page.split('<main class="container">', 1)[-1]
    return m.split("Авторы задач", 1)[0]


def article(path):
    m = main_part(get(path))
    title = re.search(r"<h\d[^>]*>(.*?)</h\d>", m, re.S)
    date = re.search(r"(\d{4}-\d{2}-\d{2})", m)
    body = m
    if title:
        body = m[title.end():]
    body = re.sub(r"<div[^>]*class=\"[^\"]*(?:navbar|breadcrumb)[^\"]*\".*?</div>", "", body, flags=re.S)
    body = re.sub(r"Дата публикации:\s*\d{4}-\d{2}-\d{2}", "", body)
    return dict(path=path, title=text(title.group(1)) if title else path, date=date.group(1) if date else "",
                html=clean(re.sub(r"</main>.*$", "", body, flags=re.S)))


# info pages
info_ids = sorted({int(x) for x in re.findall(r'href="/info/(\d+)"', get("/info"))})
with ThreadPoolExecutor(6) as ex:
    info = list(ex.map(lambda i: article(f"/info/{i}"), info_ids))

# news & announcements: walk the paginated feed on the home page, keep the math ones
feed = []
for p in range(1, 51):
    page = get(f"/?p={p}")
    for kind, nid, block in re.findall(r'href="/(news|announce)/(\d+)"[^>]*>(.*?)</a>', page, re.S):
        feed.append((kind, int(nid)))
seen, items = set(), []
for kind, nid in feed:
    if (kind, nid) not in seen:
        seen.add((kind, nid)); items.append((kind, nid))
with ThreadPoolExecutor(6) as ex:
    arts = list(ex.map(lambda kn: dict(article(f"/{kn[0]}/{kn[1]}"), kind=kn[0], id=kn[1]), items))
math_words = re.compile(r"математ|олимпиад|IMO|ММО|АТМО|APMO|Жаутыков|Эйлер|Смагулов|геометр|Туймаада|EGMO|Балкан", re.I)
physics = re.compile(r"физик|информатик|химии|химия|биолог|IPhO|IOI", re.I)
news = [a for a in arts if math_words.search(a["title"] + a["html"][:2000]) and not physics.search(a["title"])]
news.sort(key=lambda a: a["date"], reverse=True)

# books
bp = get("/books")
books = []
for blk in re.split(r'<div class="flex py-1">', bp)[1:]:
    link = re.search(r'href="(/books/book/\d+)"', blk)
    img = re.search(r'<img src="([^"]+)"', blk)
    fields = dict((text(k), text(v)) for k, v in re.findall(r'<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', blk, re.S))
    if fields.get("Наименование"):
        books.append(dict(title=fields.get("Наименование"), author=fields.get("Автор", ""),
                          desc=fields.get("Описание", "").replace("Читать полностью >", "").strip(),
                          lang=fields.get("Язык", ""), access=fields.get("Доступ", ""),
                          url="https://matol.kz" + link.group(1) if link else "https://matol.kz/books",
                          img=img.group(1).replace("matol.kz//", "matol.kz/") if img else ""))
math_books = [b for b in books if not physics.search(b["title"])]

json.dump(dict(info=info, news=news, books=math_books), open(os.path.join(os.path.dirname(__file__), "..", "raw", "pages.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(len(info), "info,", len(news), "news/announcements of", len(arts), ",", len(math_books), "books of", len(books))
