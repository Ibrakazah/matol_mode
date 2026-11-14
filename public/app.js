/* matol mod — single-page app over /data/index.json, /data/o/<oid>.json and /data/theory.json */
(function () {
    'use strict';

    var TOPICS = {
        algebra: 'Алгебра',
        combinatorics: 'Комбинаторика',
        geometry: 'Геометрия',
        number_theory: 'Теория чисел'
    };
    var ROOT_NODE = '171';      // «Математика» on matol.kz
    var RESP_NAMES = { '11': 'Районная олимпиада', '12': 'Областная олимпиада', '13': 'Заключительный этап РО' };
    var PAGE_SIZE = 20;
    var SERIES_ORDER = [];      // series node ids in tree order
    var GROUPS = [];            // [{id, title, series: [...]}] — top-level groups of the tree
    var PARENT = {};            // node id -> parent node id

    var DB = null;          // index.json
    var LANG = lsGetRaw('mm-lang') === 'kz' ? 'kz' : 'ru';
    var kzCache = {};       // oid -> promise of Kazakh statements
    var OLY = {};           // oid -> olympiad
    var PROB = {};          // id -> problem
    var BY_OLY = {};        // oid -> [problems]
    var details = {};       // oid -> promise of details
    var app = document.getElementById('app');

    // ---------- utils ----------
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function md(s) {
        if (!s) return '';
        var store = [];
        s = s.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, function (m) {
            store.push(m);
            return '@@M' + (store.length - 1) + '@@';
        });
        var h = window.marked ? marked.parse(s) : '<p>' + esc(s).replace(/\n\n/g, '</p><p>') + '</p>';
        return h.replace(/@@M(\d+)@@/g, function (_, i) { return esc(store[+i]); });
    }
    function mdInline(s) { return md(s).replace(/^\s*<p>|<\/p>\s*$/g, ''); }
    function typeset(el) {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.startup.promise.then(function () { return MathJax.typesetPromise([el]); }).catch(function () {});
        } else {
            setTimeout(function () { typeset(el); }, 300);
        }
    }
    function lsGetRaw(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function lsGet(key, def) {
        try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    }
    function lsSet(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
    }
    var marks = lsGet('mm-marks', {});   // id -> {solved:bool, star:bool}
    var notes = lsGet('mm-notes', {});   // id -> markdown text
    function isSolved(id) { return !!(marks[id] && marks[id].solved); }
    function isStar(id) { return !!(marks[id] && marks[id].star); }
    function setMark(id, k) {
        marks[id] = marks[id] || {};
        marks[id][k] = !marks[id][k];
        lsSet('mm-marks', marks);
    }
    function parseQuery(q) {
        var o = {};
        (q || '').split('&').forEach(function (kv) {
            if (!kv) return;
            var p = kv.split('=');
            o[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
        });
        return o;
    }
    function buildQuery(o) {
        return Object.keys(o).filter(function (k) { return o[k] !== '' && o[k] != null; })
            .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
    }
    function withQ(f, patch) { return '#/problems?' + buildQuery(Object.assign({}, f, { page: '' }, patch)); }
    function loadDetails(oid) {
        if (!details[oid]) {
            details[oid] = fetch('/data/o/' + oid + '.json').then(function (r) { return r.json(); });
        }
        return details[oid];
    }
    function seriesShort(c) { return (DB.series[c] || {}).short || c; }
    function seriesTitle(c) { return (DB.series[c] || {}).title || c; }
    function olyLabel(o) {
        var parent = DB.nodes[String(o.path[o.path.length - 1])];
        return parent && parent.l[o.oid] ? parent.l[o.oid] : o.title;
    }
    function olyName(o) {
        if (RESP_NAMES[o.comp] && o.grade) return RESP_NAMES[o.comp] + ', ' + o.year + ', ' + o.grade + ' класс';
        var label = olyLabel(o);
        var name = seriesShort(o.comp) + ' — ' + label;
        if (o.year && !/(19|20)\d\d/.test(label)) name += ' (' + o.year + ')';
        return name;
    }
    function loadKz(oid) {
        if (!kzCache[oid]) kzCache[oid] = fetch('/data/kz/' + oid + '.json').then(function (r) { return r.json(); }).catch(function () { return {}; });
        return kzCache[oid];
    }
    // swap statements to Kazakh where available
    function applyLang(root) {
        if (LANG !== 'kz') return;
        var els = root.querySelectorAll('[data-st]');
        Array.prototype.forEach.call(els, function (el) {
            var p = PROB[el.getAttribute('data-st')];
            loadKz(p.oid).then(function (kz) {
                if (kz[p.id]) { el.innerHTML = kz[p.id]; el.setAttribute('lang', 'kk'); typeset(el); }
            });
        });
    }
    function nodePath(id) {
        var out = [String(id)];
        while (PARENT[out[0]]) out.unshift(PARENT[out[0]]);
        return out;
    }
    function nodeCrumbs(id, extra) {
        var items = [['Все олимпиады', '#/olympiads']];
        nodePath(id).forEach(function (n) {
            if (n === ROOT_NODE) items.push(['Математика', '#/olympiads']);
            else items.push([DB.nodes[n].t, '#/node/' + n]);
        });
        return crumbs(items.concat(extra || []));
    }
    function crumbs(items) {
        return '<ol class="breadcrumb">' + items.map(function (it, i) {
            return i === items.length - 1 || !it[1] ? '<li class="active">' + esc(it[0]) + '</li>'
                : '<li><a href="' + it[1] + '">' + esc(it[0]) + '</a></li>';
        }).join('') + '</ol>';
    }
    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
        return many;
    }
    function hasSol(p) { return !!(p.src && p.src !== 'none'); }
    function setTitle(t) { document.title = t ? t + ' — matol mod' : 'Олимпиады по математике, задачи, решения'; }

    // ---------- problem rendering ----------
    function chipsHtml(p) {
        var h = '';
        if (p.topic) h += '<a class="chip t-' + p.topic + '" href="#/problems?topic=' + p.topic + '"><span class="dot"></span>' + TOPICS[p.topic] + '</a>';
        if (p.diff) h += '<a class="chip d-' + p.diff + '" href="#/problems?dmin=' + p.diff + '&dmax=' + p.diff + '" title="Сложность по шкале 1–10"><span class="dot"></span>сложность ' + p.diff + '</a>';
        (p.sub || []).forEach(function (s) {
            h += '<a class="chip" href="#/problems?sub=' + encodeURIComponent(s) + '">' + esc(s) + '</a>';
        });
        if (p.src === 'ai') h += '<span class="chip src-ai" title="Решение написано ИИ — может содержать ошибки">решение ИИ' + (p.conf && p.conf !== 'high' ? (p.conf === 'medium' ? ' · проверить' : ' · неполное') : '') + '</span>';
        if (p.src === 'matol') h += '<span class="chip src-matol" title="Решение по материалам matol.kz">решение с matol</span>';
        return '<div class="chips">' + h + '</div>';
    }
    function marksHtml(p) {
        return '<div class="p-marks">' +
            '<button data-mark="solved" data-id="' + p.id + '" class="' + (isSolved(p.id) ? 'on' : '') + '" title="Отметить как решённую">✓</button>' +
            '<button data-mark="star" data-id="' + p.id + '" class="' + (isStar(p.id) ? 'on' : '') + '" title="В избранное">' + (isStar(p.id) ? '★' : '☆') + '</button>' +
            '</div>';
    }
    function problemHtml(p, opts) {
        opts = opts || {};
        var o = OLY[p.oid];
        var head = opts.withSource
            ? '<a class="p-title" href="#/p/' + p.id + '">' + esc(olyName(o)) + ', №' + esc(p.num) + '</a>'
            : '<a class="p-title" href="#/p/' + p.id + '">' + (LANG === 'kz' ? 'Есеп №' : 'Задача №') + esc(p.num) + '</a>';
        return '<div class="card problem' + (isSolved(p.id) ? ' is-solved' : '') + '" id="p-' + p.id + '" data-pid="' + p.id + '">' +
            marksHtml(p) +
            '<div class="p-head">' + head + '</div>' +
            '<div class="stmt" data-st="' + p.id + '">' + p.st + '</div>' +
            chipsHtml(p) +
            '<div class="reveals" data-reveals="' + p.id + '"><div class="toolbar"><span class="tb-note">…</span></div></div>' +
            '</div>';
    }

    // Each reveal is a button in the toolbar + a hidden panel. Hints unlock one by one.
    function revealsHtml(p, d) {
        var btns = [], panels = [];
        function add(key, label, title, body, hidden) {
            btns.push('<button class="tb" data-tb="' + key + '"' + (hidden ? ' style="display:none"' : '') + '>' + label + '</button>');
            panels.push('<div class="panel-x" data-px="' + key + '"><div class="px-title">' + title + '</div>' + body + '</div>');
        }
        if (d.skills && d.skills.length) {
            add('skills', '💡 Теоремы', 'Какие теоремы и приёмы нужны',
                '<ul class="skill-list">' + d.skills.map(function (s) {
                    return '<li><a href="#/problems?skill=' + encodeURIComponent(s.name) + '"><b>' + mdInline(s.name) + '</b></a>' +
                        (s.note ? ' — <span class="note">' + mdInline(s.note) + '</span>' : '') + '</li>';
                }).join('') + '</ul>');
        }
        (d.hints || []).forEach(function (hint, i) {
            add('hint' + i, 'Подсказка ' + (i + 1) + ' <span class="n">из ' + d.hints.length + '</span>', 'Подсказка ' + (i + 1), md(hint), i > 0);
        });
        if (d.insight) add('insight', '🧭 Как догадаться', 'Как можно было догадаться до решения', md(d.insight));
        if (d.solution) {
            var body = '';
            if (d.answer) body += '<div class="answer-box"><b>Ответ:</b> ' + mdInline(d.answer) + '</div>';
            if (p.src === 'ai' && p.conf !== 'high') body += '<div class="warn-box">Решение написано ИИ' + (p.conf === 'low' ? ' и, скорее всего, неполное' : ' — некоторые места стоит перепроверить') + '. Сверься с обсуждением на matol.</div>';
            if (d.vnote) body += '<div class="warn-box">Проверка: ' + mdInline(d.vnote) + '</div>';
            body += md(d.solution);
            add('solution', '✅ Решение' + (p.src === 'ai' ? ' <span class="n">ИИ</span>' : ''), 'Решение' + (p.src === 'ai' ? ' (ИИ)' : ' (по matol)'), body);
        }
        if (d.comments && d.comments.length) {
            add('comments', '💬 Обсуждение <span class="n">' + d.comments.length + '</span>', 'Обсуждение на matol', commentsHtml(d));
        }
        var mine = notes[p.id] || '';
        btns.push('<button class="tb' + (mine ? ' has-note' : '') + '" data-tb="notes">📝 Заметки' + (mine ? ' <span class="n">•</span>' : '') + '</button>');
        panels.push('<div class="panel-x" data-px="notes"><div class="px-title">Мои заметки (видны только тебе)</div>' +
            '<textarea class="form-control note-area" data-note="' + p.id + '" rows="4" placeholder="Свои идеи, решение, где застрял… Можно писать формулы в $...$">' + esc(mine) + '</textarea>' +
            '<div class="note-preview" data-note-preview="' + p.id + '">' + md(mine) + '</div></div>');
        var note = '';
        if (!d.solution && !(d.comments && d.comments.length)) note = '<span class="tb-note">решение готовится</span>';
        var link = '<a class="tb-link" href="#/c/' + p.id + '">комментарий/решение(' + (d.comments ? d.comments.length : 0) + ')</a>';
        return '<div class="toolbar">' + btns.join('') + note + link + '</div>' + panels.join('');
    }
    function commentsHtml(d) {
        return d.comments.map(function (c) {
            return '<div class="mat-comment level' + Math.min(c.level, 3) + '"><div class="chead">' + esc(c.author || 'гость') +
                (c.votes ? ' · ' + (c.votes > 0 ? '+' : '') + c.votes : '') + '</div>' + c.html + '</div>';
        }).join('') + (d.cid ? '<a class="mat-href" href="https://matol.kz/comments/' + d.cid + '/show" target="_blank" rel="noopener">открыть на matol.kz ↗</a>' : '');
    }
    function fillReveals(root) {
        var nodes = root.querySelectorAll('[data-reveals]');
        Array.prototype.forEach.call(nodes, function (el) {
            var p = PROB[el.getAttribute('data-reveals')];
            loadDetails(p.oid).then(function (all) {
                el.innerHTML = revealsHtml(p, all[p.id] || {});
                typeset(el);
            });
        });
        typeset(root);
        applyLang(root);
    }
    function togglePanel(btn) {
        var box = btn.closest('.reveals');
        var key = btn.getAttribute('data-tb');
        var panel = box.querySelector('[data-px="' + key + '"]');
        var open = !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        btn.classList.toggle('on', open);
        if (open) {
            if (!panel.querySelector('.dust')) {
                var dust = document.createElement('div');
                dust.className = 'dust';
                panel.appendChild(dust);
            }
            panel.classList.remove('revealing');
            void panel.offsetWidth;
            panel.classList.add('revealing');
            var m = /^hint(\d+)$/.exec(key);
            if (m) {
                var next = box.querySelector('[data-tb="hint' + (+m[1] + 1) + '"]');
                if (next) next.style.display = '';
            }
        }
    }

    // ---------- global events ----------
    document.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target : e.target.parentNode;
        var tb = t.closest('.tb');
        if (tb) { togglePanel(tb); return; }
        var mk = t.closest('[data-mark]');
        if (mk) {
            var id = mk.getAttribute('data-id'), k = mk.getAttribute('data-mark');
            setMark(id, k);
            var on = !!marks[id][k];
            mk.classList.toggle('on', on);
            if (k === 'star') mk.textContent = on ? '★' : '☆';
            var card = mk.closest('.problem');
            if (card && k === 'solved') card.classList.toggle('is-solved', on);
            return;
        }
        var more = t.closest('.more-toggle');
        if (more) {
            var box = document.getElementById(more.getAttribute('data-target'));
            var shown = box.style.display !== 'none';
            box.style.display = shown ? 'none' : '';
            lsSet('mm-more-filters', !shown);
            return;
        }
        if (t.closest('[data-print]')) { e.preventDefault(); window.print(); return; }
        var dd = t.closest('[data-dropdown]');
        var menu = document.getElementById('more-menu');
        if (dd) { e.preventDefault(); menu.classList.toggle('open'); return; }
        if (menu && !t.closest('#more-menu .dropdown-menu')) menu.classList.remove('open');
        else if (menu) menu.classList.remove('open');
        if (t.closest('#lang-toggle')) {
            e.preventDefault();
            LANG = LANG === 'kz' ? 'ru' : 'kz';
            lsSet('mm-lang', LANG);
            updateLangButton();
            route();
            return;
        }
        if (t.closest('#theme-toggle')) {
            e.preventDefault();
            var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
            if (dark) document.documentElement.setAttribute('data-theme', 'dark');
            else document.documentElement.removeAttribute('data-theme');
            lsSet('mm-theme', dark ? 'dark' : 'light');
            return;
        }
        if (t.closest('#navtoggle')) {
            document.getElementById('navmenu').classList.toggle('in');
        } else if (t.closest('#navmenu a')) {
            document.getElementById('navmenu').classList.remove('in');
        }
    });
    function updateLangButton() {
        var b = document.getElementById('lang-toggle');
        if (b) b.textContent = LANG === 'kz' ? 'Қаз' : 'Рус';
    }
    updateLangButton();
    // personal notes: save while typing
    document.addEventListener('input', function (e) {
        var id = e.target.getAttribute && e.target.getAttribute('data-note');
        if (!id) return;
        var v = e.target.value;
        if (v.trim()) notes[id] = v; else delete notes[id];
        lsSet('mm-notes', notes);
        var pv = document.querySelector('[data-note-preview="' + id + '"]');
        if (pv) { pv.innerHTML = md(v); clearTimeout(pv._t); pv._t = setTimeout(function () { typeset(pv); }, 600); }
    });
    document.getElementById('nav-search').addEventListener('submit', function (e) {
        e.preventDefault();
        var q = this.elements.q.value.trim();
        document.getElementById('navmenu').classList.remove('in');
        location.hash = '#/problems?' + buildQuery({ q: q });
    });
    // ← / → on a problem page
    document.addEventListener('keydown', function (e) {
        if (/input|select|textarea/i.test(e.target.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
        var nav = document.querySelector(e.key === 'ArrowLeft' ? '[data-prev]' : e.key === 'ArrowRight' ? '[data-next]' : null);
        if (nav) location.hash = nav.getAttribute('href');
    });

    // ---------- pages ----------
    function seriesStats(c) {
        var list = DB.olympiads.filter(function (o) { return o.comp === c; });
        var years = list.map(function (o) { return o.year; }).filter(Boolean);
        var n = 0, s = 0;
        list.forEach(function (o) { (BY_OLY[o.oid] || []).forEach(function (p) { n++; if (isSolved(p.id)) s++; }); });
        return { n: n, solved: s, from: Math.min.apply(null, years), to: Math.max.apply(null, years) };
    }
    function seriesTile(c) {
        var s = seriesStats(c);
        return '<a class="tile" href="#/node/' + c + '"><b>' + esc(seriesShort(c)) + '</b><span>' + (s.from ? s.from + '–' + s.to + ' · ' : '') +
            s.n + ' задач' + (s.solved ? ' · решено ' + s.solved : '') + '</span></a>';
    }
    // problems under a node (recursively)
    function nodeOlys(id, acc) {
        acc = acc || [];
        var n = DB.nodes[id];
        if (!n) return acc;
        n.o.forEach(function (oid) { if (OLY[oid]) acc.push(OLY[oid]); });
        n.c.forEach(function (c) { nodeOlys(c, acc); });
        return acc;
    }
    function nodeCount(id) {
        var n = 0, s = 0;
        nodeOlys(id).forEach(function (o) { (BY_OLY[o.oid] || []).forEach(function (p) { n++; if (isSolved(p.id)) s++; }); });
        return { n: n, solved: s };
    }

    function pageHome() {
        setTitle('');
        var all = DB.problems.length;
        var solved = DB.problems.filter(function (p) { return isSolved(p.id); }).length;
        var stars = DB.problems.filter(function (p) { return isStar(p.id); }).length;
        var withSol = DB.problems.filter(hasSol).length;
        var byTopic = {};
        DB.problems.forEach(function (p) { if (p.topic) byTopic[p.topic] = (byTopic[p.topic] || 0) + 1; });

        var h = '<div class="page-title"><h2>Олимпиадная математика</h2><div class="page-sub">' + all + ' задач · ' + DB.olympiads.length + ' олимпиад · ' + withSol + ' с решениями · подсказки, теоремы и разборы «как догадаться»</div></div>';
        h += '<form class="hero-search" id="hero-search"><input type="search" class="form-control" name="q" placeholder="Найти задачу по словам из условия…" autocomplete="off"></form>';

        h += '<div class="card"><b>Мой прогресс</b>: решено ' + solved + ' из ' + all +
            '<div class="progress"><div class="progress-bar" style="width:' + (100 * solved / all).toFixed(1) + '%"></div></div>' +
            '<a class="btn btn-primary btn-sm" href="#/random">🎲 Случайная нерешённая</a> ' +
            '<a class="btn btn-default btn-sm" href="#/random?sol=1">🎲 Случайная с решением</a> ' +
            '<a class="btn btn-default btn-sm" href="#/marked">★ Избранное (' + stars + ')</a></div>';

        h += '<div class="row"><div class="col-md-8">';
        GROUPS.forEach(function (g) {
            h += '<div class="section-title">' + esc(g.title) + '</div><div class="grid">' + g.series.map(seriesTile).join('') + '</div>';
        });
        h += '<div class="section-title">Темы</div><div class="grid">';
        Object.keys(TOPICS).forEach(function (t) {
            h += '<a class="tile" href="#/problems?topic=' + t + '&sort=diff"><b><span class="chip t-' + t + '" style="padding:0;background:none"><span class="dot"></span></span>' + TOPICS[t] + '</b><span>' + (byTopic[t] || 0) + ' задач · от лёгких к сложным</span></a>';
        });
        h += '</div>';
        h += '<div class="section-title">Учиться</div><div class="grid">' +
            '<a class="tile" href="#/theory"><b>📘 Теория</b><span>конспекты по 40 темам с задачами по возрастанию сложности</span></a>' +
            '<a class="tile" href="#/skills"><b>🧩 Теоремы и приёмы</b><span>все теоремы из решений и задачи на них</span></a>' +
            '<a class="tile" href="#/info"><b>ℹ️ Об олимпиадах</b><span>правила и этапы олимпиад</span></a>' +
            '<a class="tile" href="#/books"><b>📚 Книги</b><span>сборники задач с matol.kz</span></a>' +
            '</div></div>';
        h += '<div class="col-md-4"><div class="section-title">Объявления и новости</div><div class="card side-feed" id="home-news"><span class="text-muted">…</span></div>' +
            '<div class="section-title">Последние обсуждения</div><div class="card side-feed" id="home-recent"><span class="text-muted">…</span></div></div></div>';
        app.innerHTML = h;
        document.getElementById('hero-search').addEventListener('submit', function (e) {
            e.preventDefault();
            location.hash = '#/problems?' + buildQuery({ q: this.elements.q.value.trim() });
        });
        loadPages().then(function (pg) {
            var el = document.getElementById('home-news');
            if (el) el.innerHTML = pg.news.slice(0, 6).map(newsRow).join('') + '<a href="#/news">все новости →</a>';
        });
        loadJson('recent').then(function (rc) {
            var el = document.getElementById('home-recent');
            if (el) el.innerHTML = rc.slice(0, 8).map(recentRow).join('') + '<a href="#/recent">все обсуждения →</a>';
        });
    }

    function pageOlympiads() { pageNode(ROOT_NODE); }

    // a node of the matol tree: child nodes and olympiads, like /nodes/<id> on matol
    function pageNode(id) {
        var n = DB.nodes[id];
        if (!n) return notFound();
        setTitle(n.t);
        var h = id === ROOT_NODE ? crumbs([['Все олимпиады', '#/olympiads'], ['Математика', '']]) : nodeCrumbs(id);
        h += '<div class="page-title"><h2>' + esc(id === ROOT_NODE ? 'Олимпиады по математике' : n.t) + '</h2>';
        if (DB.series[id]) h += '<div class="page-sub"><a href="#/problems?comp=' + id + '">все задачи списком с фильтрами</a></div>';
        h += '</div>';
        // children that only hold olympiads (e.g. school years) are shown as compact cells
        var leafKids = n.c.filter(function (c) { return DB.nodes[c] && !DB.nodes[c].c.length && DB.nodes[c].o.length; });
        var deepKids = n.c.filter(function (c) { return leafKids.indexOf(c) < 0 && DB.nodes[c] && nodeOlys(c).length; });
        if (deepKids.length) {
            h += '<div class="grid">' + deepKids.map(function (c) {
                var k = nodeCount(c);
                return '<a class="tile" href="#/node/' + c + '"><b>' + esc(DB.nodes[c].t) + '</b><span>' + k.n + ' задач' + (k.solved ? ' · решено ' + k.solved : '') + '</span></a>';
            }).join('') + '</div>';
        }
        if (leafKids.length) {
            leafKids.sort(function (a, b) { return DB.nodes[b].t.localeCompare(DB.nodes[a].t, 'ru', { numeric: true }); });
            h += '<div class="year-grid">' + leafKids.map(function (c) {
                var kid = DB.nodes[c];
                return '<div class="year-cell"><div class="y"><a href="#/node/' + c + '" style="color:inherit">' + esc(kid.t) + '</a></div>' +
                    kid.o.map(function (oid) { return '<a href="#/o/' + oid + '">' + esc(kid.l[oid]) + '</a>' + olyProgress(oid); }).join(' ') + '</div>';
            }).join('') + '</div>';
        }
        if (n.o.length) {
            h += '<div class="year-grid" style="margin-top:10px">' + n.o.map(function (oid) {
                return '<a class="year-cell" href="#/o/' + oid + '"><div class="y">' + esc(n.l[oid]) + olyProgress(oid) + '</div>' +
                    '<span class="cnt">' + (BY_OLY[oid] || []).length + ' задач</span></a>';
            }).join('') + '</div>';
        }
        app.innerHTML = h;
    }

    function olyProgress(oid) {
        var ps = BY_OLY[oid] || [];
        var s = ps.filter(function (p) { return isSolved(p.id); }).length;
        return s ? ' <span class="cnt">' + s + '/' + ps.length + '</span>' : '';
    }

    function pageOlympiad(oid) {
        var o = OLY[oid];
        if (!o) return notFound();
        setTitle(olyName(o));
        var probs = BY_OLY[o.oid] || [];
        var h = nodeCrumbs(o.path[o.path.length - 1], [[olyLabel(o), '']]);
        h += '<div class="page-title"><h2 id="oly-title">' + esc(o.title) + '</h2>' +
            '<div class="page-sub"><a href="https://matol.kz/olympiads/' + o.oid + '" target="_blank" rel="noopener">оригинал на matol.kz ↗</a> · ' +
            '<a href="#" data-print>🖨 распечатать</a></div></div>';
        h += probs.map(function (p) { return problemHtml(p); }).join('');
        h += siblingOlys(o);
        app.innerHTML = h;
        fillReveals(app);
        if (LANG === 'kz') loadKz(o.oid).then(function (kz) { if (kz.title) document.getElementById('oly-title').textContent = kz.title; });
    }
    function siblingOlys(o) {
        var same = DB.olympiads.filter(function (x) { return x.comp === o.comp; })
            .sort(function (a, b) { return (a.year || 0) - (b.year || 0) || (a.grade || 0) - (b.grade || 0) || a.oid - b.oid; });
        var i = same.indexOf(o);
        return '<div class="pager-row">' +
            (i > 0 ? '<a class="btn btn-default btn-sm" href="#/o/' + same[i - 1].oid + '">← ' + esc(olyName(same[i - 1])) + '</a> ' : '') +
            (i < same.length - 1 ? '<a class="btn btn-default btn-sm" href="#/o/' + same[i + 1].oid + '">' + esc(olyName(same[i + 1])) + ' →</a>' : '') +
            '</div>';
    }

    function problemCrumbs(p, last) {
        var o = OLY[p.oid];
        return nodeCrumbs(o.path[o.path.length - 1], [[olyLabel(o), '#/o/' + o.oid], ['Задача №' + p.num, last ? '#/p/' + p.id : ''], last ? [last, ''] : null].filter(Boolean));
    }
    function pageProblem(id) {
        var p = PROB[id];
        if (!p) return notFound();
        var o = OLY[p.oid];
        setTitle(olyName(o) + ', №' + p.num);
        var siblings = BY_OLY[p.oid];
        var i = siblings.indexOf(p);
        var h = problemCrumbs(p);
        h += problemHtml(p);
        h += '<div class="pager-row">' +
            (i > 0 ? '<a class="btn btn-default btn-sm" data-prev href="#/p/' + siblings[i - 1].id + '">← №' + esc(siblings[i - 1].num) + '</a> ' : '') +
            '<a class="btn btn-default btn-sm" href="#/o/' + o.oid + '">вся олимпиада</a> ' +
            (i < siblings.length - 1 ? '<a class="btn btn-default btn-sm" data-next href="#/p/' + siblings[i + 1].id + '">№' + esc(siblings[i + 1].num) + ' →</a>' : '') +
            '</div><div class="kbd-hint hidden-xs">стрелки ← → на клавиатуре листают задачи</div>';
        h += similarHtml(p);
        app.innerHTML = h;
        fillReveals(app);
        window.scrollTo(0, 0);
    }
    function similarHtml(p) {
        if (!p.topic) return '';
        var subs = p.sub || [];
        var cand = DB.problems.filter(function (q) {
            return q !== p && q.topic === p.topic && (q.sub || []).some(function (s) { return subs.indexOf(s) >= 0; });
        }).sort(function (a, b) { return Math.abs((a.diff || 5) - (p.diff || 5)) - Math.abs((b.diff || 5) - (p.diff || 5)); }).slice(0, 6);
        if (!cand.length) return '';
        return '<div class="section-title">Похожие задачи</div><div class="card">' + cand.map(listRow).join('') + '</div>';
    }
    function listRow(q) {
        return '<div class="list-row"><span class="ok">' + (isSolved(q.id) ? '✓' : '') + '</span><a href="#/p/' + q.id + '">' + esc(olyName(OLY[q.oid])) + ', №' + esc(q.num) + '</a> ' +
            chipsHtml(q).replace('class="chips"', 'class="chips" style="margin:0"') + '</div>';
    }

    // «комментарий/решение» page, as on matol
    function pageComments(id) {
        var p = PROB[id];
        if (!p) return notFound();
        setTitle('Комментарии · ' + olyName(OLY[p.oid]) + ', №' + p.num);
        var h = problemCrumbs(p, 'комментарий/решение');
        h += '<div class="card"><div class="stmt"><b>Задача №' + esc(p.num) + '.</b> ' + p.st + '</div>' + chipsHtml(p) + '</div>';
        h += '<div id="cm-body"><p class="text-muted">Загрузка…</p></div>';
        app.innerHTML = h;
        typeset(app);
        loadDetails(p.oid).then(function (all) {
            var d = all[p.id] || {};
            var body = '';
            if (d.solution) {
                body += '<div class="section-title">Решение' + (p.src === 'ai' ? ' (ИИ)' : ' (по matol)') + '</div><div class="card">' +
                    (d.answer ? '<div class="answer-box"><b>Ответ:</b> ' + mdInline(d.answer) + '</div>' : '') + md(d.solution) + '</div>';
            }
            body += '<div class="section-title">Комментарии с matol (' + (d.comments || []).length + ')</div>';
            body += '<div class="card">' + ((d.comments && d.comments.length) ? commentsHtml(d) : '<p class="text-muted" style="margin:0">Комментариев нет.' +
                (d.cid ? ' <a href="https://matol.kz/comments/' + d.cid + '/show" target="_blank" rel="noopener">matol.kz ↗</a>' : '') + '</p>') + '</div>';
            var el = document.getElementById('cm-body');
            el.innerHTML = body;
            typeset(el);
        });
    }

    function filterProblems(f) {
        var q = (f.q || '').toLowerCase();
        var skill = (f.skill || '').toLowerCase();
        return DB.problems.filter(function (p) {
            var o = OLY[p.oid];
            if (f.topic && p.topic !== f.topic) return false;
            if (f.sub && (p.sub || []).indexOf(f.sub) < 0) return false;
            if (f.comp && o.comp !== f.comp) return false;
            if (f.grade && String(o.grade) !== f.grade) return false;
            if (f.ymin && o.year < +f.ymin) return false;
            if (f.ymax && o.year > +f.ymax) return false;
            if (f.dmin && !(p.diff >= +f.dmin)) return false;
            if (f.dmax && !(p.diff <= +f.dmax)) return false;
            if (f.sol === '1' && !hasSol(p)) return false;
            if (f.sol === 'high' && !(hasSol(p) && p.conf === 'high')) return false;
            if (f.sol === '0' && hasSol(p)) return false;
            if (f.st === 'unsolved' && isSolved(p.id)) return false;
            if (f.st === 'solved' && !isSolved(p.id)) return false;
            if (f.st === 'star' && !isStar(p.id)) return false;
            if (f.author && (p.au || []).indexOf(f.author) < 0) return false;
            if (skill && !p.skills.some(function (s) { return s.toLowerCase().indexOf(skill) >= 0; })) return false;
            if (q && p.st.toLowerCase().indexOf(q) < 0) return false;
            return true;
        });
    }
    function sortProblems(list, sort) {
        var key = {
            'diff': function (a, b) { return (a.diff || 99) - (b.diff || 99); },
            '-diff': function (a, b) { return (b.diff || 0) - (a.diff || 0); },
            '-year': function (a, b) { return OLY[b.oid].year - OLY[a.oid].year; },
            'year': function (a, b) { return OLY[a.oid].year - OLY[b.oid].year; }
        }[sort];
        return key ? list.slice().sort(key) : list;
    }
    function opt(v, label, cur) {
        return '<option value="' + esc(v) + '"' + (String(cur || '') === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }
    function allSubtopics(topic) {
        var c = {};
        DB.problems.forEach(function (p) {
            if (topic && p.topic !== topic) return;
            (p.sub || []).forEach(function (s) { c[s] = (c[s] || 0) + 1; });
        });
        return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (s) { return [s, c[s]]; });
    }
    var FILTER_LABELS = {
        sub: function (v) { return v; }, comp: function (v) { return seriesShort(v); }, grade: function (v) { return v + ' класс'; },
        dmin: function (v) { return 'сложность ≥ ' + v; }, dmax: function (v) { return 'сложность ≤ ' + v; },
        ymin: function (v) { return 'с ' + v + ' года'; }, ymax: function (v) { return 'до ' + v + ' года'; },
        skill: function (v) { return 'теорема: ' + v; }, q: function (v) { return '«' + v + '»'; },
        sol: function (v) { return { '1': 'с решением', high: 'надёжное решение', '0': 'без решения' }[v]; },
        st: function (v) { return { unsolved: 'нерешённые', solved: 'решённые', star: 'избранное' }[v]; },
        author: function (v) { return 'автор: ' + (DB.authors[v] || v); }
    };

    function pageProblems(f) {
        setTitle('Задачи');
        var list = sortProblems(filterProblems(f), f.sort);
        var page = Math.max(1, +f.page || 1);
        var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        var years = [];
        for (var y = 2026; y >= 1990; y--) years.push(y);
        var diffs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        var h = crumbs([['Главная', '#/'], ['Задачи', '']]);
        // quick topic + olympiad switches
        h += '<div class="seg"><a href="' + withQ(f, { topic: '', sub: '' }) + '" class="' + (!f.topic ? 'on' : '') + '">Все темы</a>' +
            Object.keys(TOPICS).map(function (t) {
                return '<a href="' + withQ(f, { topic: t, sub: '' }) + '" class="' + (f.topic === t ? 'on' : '') + '">' + TOPICS[t] + '</a>';
            }).join('') + '</div>';
        h += '<div class="seg"><select class="form-control input-sm seg-select" id="comp-select">' + opt('', 'Все олимпиады', f.comp) +
            GROUPS.map(function (g) {
                return '<optgroup label="' + esc(g.title) + '">' + g.series.map(function (c) { return opt(c, seriesShort(c), f.comp); }).join('') + '</optgroup>';
            }).join('') + '</select></div>';

        // active filter chips
        var act = Object.keys(FILTER_LABELS).filter(function (k) { return f[k]; });
        if (act.length) {
            h += '<div class="chips active-filters">' + act.map(function (k) {
                var patch = {}; patch[k] = '';
                return '<span class="chip">' + esc(FILTER_LABELS[k](f[k])) + '<a href="' + withQ(f, patch) + '" title="убрать">✕</a></span>';
            }).join('') + ' <a class="chip" href="#/problems">сбросить всё</a></div>';
        }

        var showMore = lsGet('mm-more-filters', false);
        h += '<span class="more-toggle" data-target="more-filters">⚙ Фильтры и сортировка</span>';
        h += '<form class="filters" id="more-filters"' + (showMore ? '' : ' style="display:none"') + '><div class="row">';
        h += '<div class="col-sm-4 form-group"><label>Подтема</label><select class="form-control input-sm" name="sub">' + opt('', 'все', f.sub) +
            allSubtopics(f.topic).map(function (s) { return opt(s[0], s[0] + ' (' + s[1] + ')', f.sub); }).join('') + '</select></div>';
        h += '<div class="col-sm-4 form-group"><label>Теорема / приём</label><input class="form-control input-sm" name="skill" list="skill-list" placeholder="напр. Ферма, AM-GM" value="' + esc(f.skill) + '"></div>';
        h += '<div class="col-sm-4 form-group"><label>Поиск в условии</label><input class="form-control input-sm" name="q" placeholder="слово из условия" value="' + esc(f.q) + '"></div>';
        h += '</div><div class="row">';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>Сложность от</label><select class="form-control input-sm" name="dmin">' + opt('', '—', f.dmin) +
            diffs.map(function (d) { return opt(d, d, f.dmin); }).join('') + '</select></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>до</label><select class="form-control input-sm" name="dmax">' + opt('', '—', f.dmax) +
            diffs.map(function (d) { return opt(d, d, f.dmax); }).join('') + '</select></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>Год от</label><select class="form-control input-sm" name="ymin">' + opt('', '—', f.ymin) +
            years.map(function (d) { return opt(d, d, f.ymin); }).join('') + '</select></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>до</label><select class="form-control input-sm" name="ymax">' + opt('', '—', f.ymax) +
            years.map(function (d) { return opt(d, d, f.ymax); }).join('') + '</select></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>Класс</label><select class="form-control input-sm" name="grade">' + opt('', 'любой', f.grade) +
            opt('9', '9', f.grade) + opt('10', '10', f.grade) + opt('11', '11', f.grade) + '</select></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>Решение</label><select class="form-control input-sm" name="sol">' + opt('', 'любые', f.sol) +
            opt('1', 'есть', f.sol) + opt('high', 'надёжное', f.sol) + opt('0', 'нет', f.sol) + '</select></div>';
        h += '</div><div class="row">';
        h += '<div class="col-sm-3 col-xs-6 form-group"><label>Мои отметки</label><select class="form-control input-sm" name="st">' + opt('', 'все', f.st) +
            opt('unsolved', 'нерешённые', f.st) + opt('solved', 'решённые', f.st) + opt('star', 'избранное', f.st) + '</select></div>';
        h += '<div class="col-sm-3 col-xs-6 form-group"><label>Сортировка</label><select class="form-control input-sm" name="sort">' + opt('', 'по олимпиадам', f.sort) +
            opt('diff', 'легче → сложнее', f.sort) + opt('-diff', 'сложнее → легче', f.sort) + opt('-year', 'новые сначала', f.sort) + opt('year', 'старые сначала', f.sort) + '</select></div>';
        ['topic', 'comp', 'author'].forEach(function (k) { if (f[k]) h += '<input type="hidden" name="' + k + '" value="' + esc(f[k]) + '">'; });
        h += '</div><datalist id="skill-list">' + skillCounts().slice(0, 400).map(function (s) { return '<option value="' + esc(s[0]) + '">'; }).join('') + '</datalist>';
        h += '</form>';

        h += '<div class="result-count"><span>Найдено: <b>' + list.length + '</b> ' + plural(list.length, 'задача', 'задачи', 'задач') + (pages > 1 ? ' · стр. ' + page + ' из ' + pages : '') + '</span>' +
            (list.length ? '<a href="#/random?' + buildQuery(Object.assign({}, f, { page: '' })) + '">🎲 случайная из найденных</a>' : '') + '</div>';
        h += list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(function (p) { return problemHtml(p, { withSource: true }); }).join('');
        if (!list.length) h += '<div class="card text-muted">Ничего не найдено. Попробуй убрать часть фильтров.</div>';
        if (pages > 1) {
            h += '<div class="pager-row">';
            if (page > 1) h += '<a class="btn btn-default btn-sm" href="' + withQ(f, { page: page - 1 }) + '">← назад</a> ';
            h += '<span class="text-muted" style="margin:0 8px">' + page + ' / ' + pages + '</span>';
            if (page < pages) h += '<a class="btn btn-default btn-sm" href="' + withQ(f, { page: page + 1 }) + '">дальше →</a>';
            h += '</div>';
        }
        app.innerHTML = h;
        var form = document.getElementById('more-filters');
        function apply() {
            var nf = {};
            Array.prototype.forEach.call(form.elements, function (el) { if (el.name) nf[el.name] = el.value; });
            location.hash = '#/problems?' + buildQuery(nf);
        }
        form.addEventListener('change', apply);
        form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
        document.getElementById('comp-select').addEventListener('change', function () { location.hash = withQ(f, { comp: this.value }); });
        fillReveals(app);
        window.scrollTo(0, 0);
    }

    function skillCounts(topic) {
        var c = {};
        DB.problems.forEach(function (p) {
            if (topic && p.topic !== topic) return;
            p.skills.forEach(function (s) { c[s] = (c[s] || 0) + 1; });
        });
        return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b); }).map(function (s) { return [s, c[s]]; });
    }

    function pageSkills() {
        setTitle('Теоремы и приёмы');
        var h = crumbs([['Главная', '#/'], ['Теоремы и приёмы', '']]);
        h += '<p class="text-muted">Теоремы, леммы и приёмы из решений. Число — сколько задач их используют. Самые частые — первыми.</p>';
        ['algebra', 'number_theory', 'combinatorics', 'geometry'].forEach(function (t) {
            var list = skillCounts(t);
            if (!list.length) return;
            h += '<div class="card"><h4 style="color:var(--accent)">' + TOPICS[t] + '</h4><div class="idx">' +
                list.map(function (s) {
                    return '<a href="#/problems?topic=' + t + '&skill=' + encodeURIComponent(s[0]) + '&sort=diff">' + esc(s[0]) + ' <span class="cnt">' + s[1] + '</span></a>';
                }).join('') + '</div></div>';
        });
        app.innerHTML = h;
        typeset(app);
    }

    function pageAuthors() {
        setTitle('Авторы');
        var cnt = {};
        DB.problems.forEach(function (p) { (p.au || []).forEach(function (a) { cnt[a] = (cnt[a] || 0) + 1; }); });
        var ids = Object.keys(DB.authors).sort(function (a, b) { return DB.authors[a].localeCompare(DB.authors[b], 'ru'); });
        var h = crumbs([['Главная', '#/'], ['Авторы задач', '']]);
        h += '<div class="card idx">' + ids.map(function (a) {
            return '<a href="#/author/' + a + '">' + esc(DB.authors[a]) + ' <span class="cnt">' + (cnt[a] || 0) + '</span></a>';
        }).join('') + '</div>';
        app.innerHTML = h;
    }
    function pageAuthor(a) {
        if (!DB.authors[a]) return notFound();
        location.replace('#/problems?' + buildQuery({ author: a }));
    }

    function pageRandom(f) {
        if (!f.st) f.st = 'unsolved';
        var list = filterProblems(f);
        if (!list.length) { app.innerHTML = '<div class="card">Под эти фильтры задач нет. <a href="#/problems">К задачам</a></div>'; return; }
        var p = list[Math.floor(Math.random() * list.length)];
        location.replace('#/p/' + p.id);
    }

    function pageMarked(f) {
        setTitle('Мои задачи');
        var tab = f.tab || 'star';
        var list = DB.problems.filter(function (p) { return tab === 'star' ? isStar(p.id) : tab === 'notes' ? !!notes[p.id] : isSolved(p.id); });
        var nNotes = DB.problems.filter(function (p) { return !!notes[p.id]; }).length;
        var nStar = DB.problems.filter(function (p) { return isStar(p.id); }).length;
        var nSol = DB.problems.filter(function (p) { return isSolved(p.id); }).length;
        var h = crumbs([['Главная', '#/'], ['Мои задачи', '']]);
        h += '<div class="seg"><a href="#/marked?tab=star" class="' + (tab === 'star' ? 'on' : '') + '">★ Избранное (' + nStar + ')</a>' +
            '<a href="#/marked?tab=solved" class="' + (tab === 'solved' ? 'on' : '') + '">✓ Решённые (' + nSol + ')</a>' +
            '<a href="#/marked?tab=notes" class="' + (tab === 'notes' ? 'on' : '') + '">📝 С заметками (' + nNotes + ')</a></div>';
        h += '<p class="text-muted" style="font-size:12px">Отметки хранятся только в этом браузере.</p>';
        if (!list.length) h += '<div class="card text-muted">Пока пусто. Отмечай задачи кнопками ✓ и ☆ в правом верхнем углу карточки.</div>';
        else if (tab !== 'solved') h += list.map(function (p) { return problemHtml(p, { withSource: true }); }).join('');
        else h += '<div class="card">' + list.map(listRow).join('') + '</div>';
        app.innerHTML = h;
        fillReveals(app);
    }

    // ---------- theory ----------
    var THEORY = null;
    function loadTheory() {
        if (!THEORY) THEORY = fetch('/data/theory.json').then(function (r) { return r.json(); });
        return THEORY;
    }
    function pageTheory() {
        setTitle('Теория');
        loadTheory().then(function (th) {
            var h = crumbs([['Главная', '#/'], ['Теория', '']]);
            h += '<p class="text-muted">Конспекты по темам: основные факты, признаки «когда это применять», типичные ошибки и задачи из базы от лёгких к сложным. Конспекты написаны ИИ — важные утверждения перепроверяй.</p>';
            ['algebra', 'number_theory', 'combinatorics', 'geometry'].forEach(function (a) {
                var items = th.filter(function (t) { return t.area === a; });
                if (!items.length) return;
                h += '<div class="section-title">' + TOPICS[a] + '</div><div class="grid">' +
                    items.map(function (t) {
                        var s = t.problems.filter(function (p) { return isSolved(p.id); }).length;
                        return '<a class="tile" href="#/theory/' + t.id + '"><b>' + esc(t.title) + '</b><span>' + t.problems.length + ' задач' +
                            (s ? ' · решено ' + s : '') + (t.note ? '' : ' · конспект готовится') + '</span></a>';
                    }).join('') + '</div>';
            });
            app.innerHTML = h;
        });
    }
    function pageTheoryTopic(id) {
        loadTheory().then(function (th) {
            var t = th.filter(function (x) { return x.id === id; })[0];
            if (!t) return notFound();
            setTitle(t.title);
            var h = crumbs([['Главная', '#/'], ['Теория', '#/theory'], [t.title, '']]);
            h += '<div class="page-title"><h2>' + esc(t.title) + '</h2></div>';
            if (t.note) {
                var body = md(t.note).replace(/\[\[(m[\w\-.]+)\]\]/g, function (_, pid) {
                    return PROB[pid] ? '<a href="#/p/' + pid + '">' + esc(olyName(OLY[PROB[pid].oid])) + ', №' + esc(PROB[pid].num) + '</a>' : pid;
                });
                h += '<div class="card theory-note">' + body + '</div>';
            } else {
                h += '<div class="card text-muted">Конспект по этой теме ещё не написан.</div>';
            }
            var ps = t.problems.filter(function (p) { return PROB[p.id]; });
            h += '<div class="section-title">Задачи по теме — от лёгких к сложным (' + ps.length + ')</div>';
            h += '<p><a class="btn btn-default btn-sm" href="#/problems?' + buildQuery({ topic: t.area }) + '&sort=diff">открыть списком с подсказками</a></p>';
            var cur = null, out = '';
            ps.forEach(function (p) {
                var d = p.diff || 0;
                if (d !== cur) { cur = d; out += '<div class="px-title" style="margin-top:12px;color:var(--accent)">' + (d ? 'Сложность ' + d : 'Сложность не указана') + '</div>'; }
                out += listRow(PROB[p.id]);
            });
            h += '<div class="card">' + (out || '<span class="text-muted">Пока нет задач.</span>') + '</div>';
            app.innerHTML = h;
            typeset(app);
        });
    }


    // ---------- matol content: info, news, books, rating, recent discussions ----------
    var jsonCache = {};
    function loadJson(name) {
        if (!jsonCache[name]) jsonCache[name] = fetch('/data/' + name + '.json').then(function (r) { return r.json(); });
        return jsonCache[name];
    }
    function loadPages() { return loadJson('pages'); }
    function fmtDate(ts) {
        var d = new Date(ts * 1000);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function newsRow(n) {
        return '<div class="feed-row"><span class="cnt">' + esc(n.date) + '</span> <span class="chip kind-' + n.kind + '">' + (n.kind === 'announce' ? 'объявление' : 'новость') + '</span><br>' +
            '<a href="#/news/' + n.kind + '/' + n.id + '">' + esc(n.title) + '</a></div>';
    }
    function recentRow(r) {
        var p = PROB[r.pid];
        if (!p) return '';
        return '<div class="feed-row"><span class="cnt">' + fmtDate(r.time) + ' · ' + esc(r.author || 'гость') + '</span><br>' +
            '<a href="#/c/' + r.pid + '">' + esc(olyName(OLY[p.oid])) + ', №' + esc(p.num) + '</a><div class="cnt">' + esc(r.text) + '</div></div>';
    }
    function pageInfo(id) {
        setTitle('Об олимпиадах');
        loadPages().then(function (pg) {
            var h = crumbs([['Главная', '#/'], ['Инфо', id ? '#/info' : ''], id ? [(pg.info[+id] || {}).title || '', ''] : null].filter(Boolean));
            if (id && pg.info[+id]) {
                var it = pg.info[+id];
                h += '<div class="page-title"><h2>' + esc(it.title) + '</h2></div><div class="card article">' + it.html + '</div>';
            } else {
                h += '<div class="page-title"><h2>Информация об олимпиадах</h2></div><div class="grid">' + pg.info.map(function (it, i) {
                    return '<a class="tile" href="#/info/' + i + '"><b>' + esc(it.title) + '</b></a>';
                }).join('') + '</div>';
            }
            app.innerHTML = h;
            typeset(app);
        });
    }
    function pageNews(f, kind, id) {
        setTitle('Новости');
        loadPages().then(function (pg) {
            if (kind) {
                var it = pg.news.filter(function (n) { return n.kind === kind && String(n.id) === String(id); })[0];
                if (!it) return notFound();
                app.innerHTML = crumbs([['Главная', '#/'], ['Новости и объявления', '#/news'], [it.title, '']]) +
                    '<div class="page-title"><h2>' + esc(it.title) + '</h2><div class="page-sub">' + esc(it.date) +
                    ' · <a href="https://matol.kz' + it.path + '" target="_blank" rel="noopener">на matol.kz ↗</a></div></div><div class="card article">' + it.html + '</div>';
                typeset(app);
                return;
            }
            var tab = f.tab || '';
            var list = pg.news.filter(function (n) { return !tab || n.kind === tab; });
            var h = crumbs([['Главная', '#/'], ['Новости и объявления', '']]);
            h += '<div class="seg"><a href="#/news" class="' + (!tab ? 'on' : '') + '">Все</a><a href="#/news?tab=announce" class="' + (tab === 'announce' ? 'on' : '') + '">Объявления</a>' +
                '<a href="#/news?tab=news" class="' + (tab === 'news' ? 'on' : '') + '">Новости</a></div>';
            h += '<div class="card">' + list.map(newsRow).join('') + '</div>';
            app.innerHTML = h;
        });
    }
    function pageBooks() {
        setTitle('Книги');
        loadPages().then(function (pg) {
            var h = crumbs([['Главная', '#/'], ['Книги', '']]);
            h += '<div class="page-title"><h2>Книги</h2><div class="page-sub">сборники задач и решений, изданные с участием matol.kz — заказ на сайте matol</div></div>';
            h += pg.books.map(function (b) {
                return '<div class="card book">' + (b.img ? '<img src="' + esc(b.img) + '" alt="" loading="lazy">' : '') +
                    '<div><b>' + esc(b.title) + '</b><div class="cnt">' + esc(b.author) + '</div><p>' + esc(b.desc) + '</p>' +
                    '<div class="cnt">' + esc(b.lang) + (b.access ? ' · ' + esc(b.access) : '') + '</div>' +
                    '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">открыть на matol.kz ↗</a></div></div>';
            }).join('');
            app.innerHTML = h;
        });
    }
    function pageRating() {
        setTitle('Рейтинг');
        loadJson('rating').then(function (rows) {
            var h = crumbs([['Главная', '#/'], ['Рейтинг', '']]);
            h += '<div class="page-title"><h2>Рейтинг авторов решений</h2><div class="page-sub">по комментариям к задачам в этой базе: сколько задач человек разобрал и сколько голосов получил на matol</div></div>';
            h += '<div class="card"><table class="table table-condensed rating"><thead><tr><th>№</th><th>Логин</th><th>Задач</th><th>Комментариев</th><th>Голоса</th><th>Последний</th></tr></thead><tbody>' +
                rows.slice(0, 200).map(function (r, i) {
                    return '<tr><td>' + (i + 1) + '</td><td><a href="#/recent?author=' + encodeURIComponent(r.author) + '">' + esc(r.author) + '</a></td><td>' + r.problems + '</td><td>' + r.n + '</td><td>' + r.votes + '</td><td class="cnt">' + (r.last ? fmtDate(r.last) : '') + '</td></tr>';
                }).join('') + '</tbody></table></div>';
            app.innerHTML = h;
        });
    }
    function pageRecent(f) {
        setTitle('Последние обсуждения');
        loadJson('recent').then(function (rc) {
            var list = f.author ? [] : rc;
            var h = crumbs([['Главная', '#/'], ['Последние обсуждения', '']]);
            if (f.author) {
                // all comments of one person, from the per-olympiad files
                h += '<div class="page-title"><h2>Комментарии: ' + esc(f.author) + '</h2></div><div class="card" id="author-comments">Загрузка…</div>';
                app.innerHTML = h;
                var oids = Object.keys(BY_OLY);
                var found = [];
                Promise.all(oids.map(function (oid) {
                    return loadDetails(oid).then(function (all) {
                        Object.keys(all).forEach(function (pid) {
                            (all[pid].comments || []).forEach(function (c) { if (c.author === f.author) found.push({ pid: pid, author: c.author, time: c.time, text: c.html.replace(/<[^>]+>/g, ' ').slice(0, 180) }); });
                        });
                    });
                })).then(function () {
                    found.sort(function (a, b) { return b.time - a.time; });
                    document.getElementById('author-comments').innerHTML = found.map(recentRow).join('') || 'Ничего не найдено.';
                });
                return;
            }
            h += '<div class="page-title"><h2>Последние обсуждения</h2><div class="page-sub">свежие комментарии к задачам на matol.kz (снимок)</div></div>';
            h += '<div class="card">' + list.map(recentRow).join('') + '</div>';
            app.innerHTML = h;
        });
    }

    function notFound() {
        setTitle('Не найдено');
        app.innerHTML = '<div class="card" style="margin-top:30px">Страница не найдена. <a href="#/">На главную</a></div>';
    }

    // ---------- router ----------
    function route() {
        var hash = location.hash.replace(/^#/, '') || '/';
        var qi = hash.indexOf('?');
        var path = qi >= 0 ? hash.slice(0, qi) : hash;
        var f = parseQuery(qi >= 0 ? hash.slice(qi + 1) : '');
        var parts = path.split('/').filter(Boolean);
        var sec = parts[0] || '';
        Array.prototype.forEach.call(document.querySelectorAll('#navmenu [data-nav]'), function (li) {
            var n = li.getAttribute('data-nav');
            var on = n === sec || (n === 'olympiads' && /^(n|o|node)$/.test(sec)) || (n === 'problems' && /^(p|c)$/.test(sec)) || (n === 'authors' && sec === 'author');
            li.classList.toggle('active', on);
        });
        if (!parts.length) pageHome();
        else if (sec === 'olympiads') pageOlympiads();
        else if (sec === 'n' || sec === 'node') pageNode(parts[1]);
        else if (sec === 'info') pageInfo(parts[1]);
        else if (sec === 'news') pageNews(f, parts[1], parts[2]);
        else if (sec === 'books') pageBooks();
        else if (sec === 'rating') pageRating();
        else if (sec === 'recent') pageRecent(f);
        else if (sec === 'o') pageOlympiad(+parts[1]);
        else if (sec === 'p') pageProblem(decodeURIComponent(parts[1]));
        else if (sec === 'c') pageComments(decodeURIComponent(parts[1]));
        else if (sec === 'problems') pageProblems(f);
        else if (sec === 'skills') pageSkills();
        else if (sec === 'authors') pageAuthors();
        else if (sec === 'author') pageAuthor(parts[1]);
        else if (sec === 'theory') { if (parts[1]) pageTheoryTopic(parts[1]); else pageTheory(); }
        else if (sec === 'random') pageRandom(f);
        else if (sec === 'marked') pageMarked(f);
        else notFound();
        if (sec !== 'p' && sec !== 'problems') window.scrollTo(0, 0);
    }

    fetch('/data/index.json').then(function (r) { return r.json(); }).then(function (db) {
        DB = db;
        db.olympiads.forEach(function (o) { OLY[o.oid] = o; });
        Object.keys(db.nodes).forEach(function (id) { db.nodes[id].c.forEach(function (c) { PARENT[c] = id; }); });
        (function walk(id, group) {
            var n = db.nodes[id];
            if (!n) return;
            if (db.series[id] && SERIES_ORDER.indexOf(id) < 0) { SERIES_ORDER.push(id); if (group) group.series.push(id); }
            n.c.forEach(function (c) {
                var g = group;
                if (id === ROOT_NODE) { g = { id: c, title: db.nodes[c].t, series: [] }; GROUPS.push(g); }
                walk(c, g);
            });
        })(ROOT_NODE, null);
        GROUPS = GROUPS.filter(function (g) { return g.series.length; });
        db.problems.forEach(function (p) {
            PROB[p.id] = p;
            (BY_OLY[p.oid] = BY_OLY[p.oid] || []).push(p);
        });
        window.addEventListener('hashchange', route);
        route();
    }).catch(function (e) {
        app.innerHTML = '<div class="card text-danger">Не удалось загрузить данные: ' + esc(e) + '</div>';
    });
})();
