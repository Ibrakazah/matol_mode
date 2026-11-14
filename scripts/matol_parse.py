"""Parsers for matol.kz olympiad and comment pages."""
import re, html
from matol_fetch import get


def clean(s):
    s = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    s = s.replace("&nbsp;", " ")
    s = re.sub(r'src="/', 'src="https://matol.kz/', s)
    return s.strip()


def parse_olympiad(oid, lang="ru"):
    """Return (title, [problem dicts]) for /olympiads/<oid>."""
    page = get(f"/olympiads/{oid}" + ("?lang=kz" if lang == "kz" else ""))
    title = re.search(r"<h2>(.*?)</h2>", page, re.S)
    title = html.unescape(re.sub(r"\s+", " ", title.group(1)).strip()) if title else ""
    main = page.split('<ol class="breadcrumb">', 1)[-1]
    word = "Есеп" if lang == "kz" else "Задача"
    parts = re.split(r"<b>\s*(?:%s)\s*№\s*([\w.\-]+?)\.?\s*</b>" % word, main)
    probs = []
    for i in range(1, len(parts), 2):
        num, body = parts[i], parts[i + 1]
        cm = re.search(r'href="/comments/(\d+)/show"[^>]*>[^<(]*\((\d+)\)', body)
        stmt = body[: cm.start()] if cm else body.split("<hr", 1)[0]
        stmt = re.sub(r"<a [^>]*$", "", stmt.strip())
        stmt = re.sub(r"(<br\s*/?>\s*)+$", "", stmt.strip())
        probs.append(dict(num=num, statement=clean(stmt), cid=int(cm.group(1)) if cm else None,
                          ncomments=int(cm.group(2)) if cm else 0))
    return title, probs


def parse_comments(cid):
    page = get(f"/comments/{cid}/show")
    out = []
    for blk in re.split(r'<div class="mat-comment level', page)[1:]:
        lvl = re.match(r"(\d+)", blk)
        author = re.search(r'href="/profile/([^"]+)"', blk)
        votes = re.search(r'class="vote-number">\s*(-?\d+)', blk)
        when = re.search(r'ref-time="(\d+)"', blk)
        body = re.search(r'<div class="comment-body"[^>]*>(.*?)</div>\s*<div class="handle', blk, re.S)
        if body:
            out.append(dict(level=int(lvl.group(1)) if lvl else 0, author=author.group(1) if author else None,
                            votes=int(votes.group(1)) if votes else 0, time=int(when.group(1)) // 1000 if when else 0,
                            html=clean(body.group(1))))
    return out
