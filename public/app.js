/* matol mod — single-page app over /data/index.json, /data/o/<oid>.json and /data/theory.json */
(function () {
    'use strict';

    var TOPICS = {
        algebra: 'Алгебра',
        combinatorics: 'Комбинаторика',
        geometry: 'Геометрия',
        number_theory: 'Теория чисел'
    };
    var COMP_ORDER = ['resp-region', 'resp-final', 'izho', 'silk', 'apmo', 'bmo', 'jbmo'];
    var COMP_SHORT = {
        'resp-region': 'Респа, область', 'resp-final': 'Респа, финал', izho: 'Жаутыковская',
        silk: 'Шелковый путь', apmo: 'АТМО', bmo: 'BMO', jbmo: 'JBMO'
    };
    // olympiad tree as on matol.kz
    var TREE = [
        { title: 'Республиканская олимпиада', comps: ['resp-region', 'resp-final'] },
        { title: 'Международные олимпиады', comps: ['izho', 'bmo', 'jbmo'] },
        { title: 'Дистанционные олимпиады', comps: ['silk', 'apmo'] }
    ];
    var PAGE_SIZE = 20;

    var DB = null;          // index.json
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
    function lsGet(key, def) {
        try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    }
    function lsSet(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
    }
    var marks = lsGet('mm-marks', {});   // id -> {solved:bool, star:bool}
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
    function olyName(o) {
        if (o.comp.indexOf('resp') === 0) {
            return (o.comp === 'resp-region' ? 'Областная олимпиада' : 'Заключительный этап РО') + ', ' + o.year + ', ' + o.grade + ' класс';
        }
        return COMP_SHORT[o.comp] + ' ' + o.year;
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
            : '<a class="p-title" href="#/p/' + p.id + '">Задача №' + esc(p.num) + '</a>';
        return '<div class="card problem' + (isSolved(p.id) ? ' is-solved' : '') + '" id="p-' + p.id + '" data-pid="' + p.id + '">' +
            marksHtml(p) +
            '<div class="p-head">' + head + '</div>' +
            '<div class="stmt">' + p.st + '</div>' +
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
        var note = '';
        if (!d.solution && p.topic === 'geometry') note = '<span class="tb-note">геометрия — решения ИИ пока нет</span>';
        else if (!d.solution && !(d.comments && d.comments.length)) note = '<span class="tb-note">решения пока нет</span>';
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
    function compStats(c) {
        var list = DB.olympiads.filter(function (o) { return o.comp === c; });
        var years = list.map(function (o) { return o.year; });
        var n = 0, s = 0;
        list.forEach(function (o) { (BY_OLY[o.oid] || []).forEach(function (p) { n++; if (isSolved(p.id)) s++; }); });
        return { n: n, solved: s, from: Math.min.apply(null, years), to: Math.max.apply(null, years) };
    }

    function pageHome() {
        setTitle('');
        var all = DB.problems.length;
        var solved = DB.problems.filter(function (p) { return isSolved(p.id); }).length;
        var stars = DB.problems.filter(function (p) { return isStar(p.id); }).length;
        var withSol = DB.problems.filter(hasSol).length;
        var byTopic = {};
        DB.problems.forEach(function (p) { if (p.topic) byTopic[p.topic] = (byTopic[p.topic] || 0) + 1; });

        var h = '<div class="page-title"><h2>Олимпиадная математика</h2><div class="page-sub">' + all + ' задач · ' + withSol + ' с решениями · подсказки, теоремы и разборы «как догадаться»</div></div>';
        h += '<form class="hero-search" id="hero-search"><input type="search" class="form-control" name="q" placeholder="Найти задачу по словам из условия…" autocomplete="off"></form>';

        h += '<div class="card"><b>Мой прогресс</b>: решено ' + solved + ' из ' + all +
            '<div class="progress"><div class="progress-bar" style="width:' + (100 * solved / all).toFixed(1) + '%"></div></div>' +
            '<a class="btn btn-primary btn-sm" href="#/random">🎲 Случайная нерешённая</a> ' +
            '<a class="btn btn-default btn-sm" href="#/random?sol=1">🎲 Случайная с решением</a> ' +
            '<a class="btn btn-default btn-sm" href="#/marked">★ Избранное (' + stars + ')</a></div>';

        h += '<div class="section-title">Олимпиады</div><div class="grid">';
        COMP_ORDER.forEach(function (c) {
            var s = compStats(c);
            h += '<a class="tile" href="#/n/' + c + '"><b>' + esc(COMP_SHORT[c]) + '</b><span>' + s.from + '–' + s.to + ' · ' + s.n + ' задач' + (s.solved ? ' · решено ' + s.solved : '') + '</span></a>';
        });
        h += '</div>';

        h += '<div class="section-title">Темы</div><div class="grid">';
        Object.keys(TOPICS).forEach(function (t) {
            h += '<a class="tile t-' + t + '" href="#/problems?topic=' + t + '&sort=diff"><b><span class="chip t-' + t + '" style="padding:0;background:none"><span class="dot"></span></span>' + TOPICS[t] + '</b><span>' + (byTopic[t] || 0) + ' задач · от лёгких к сложным</span></a>';
        });
        h += '</div>';

        h += '<div class="section-title">Учиться</div><div class="grid">' +
            '<a class="tile" href="#/theory"><b>📘 Теория</b><span>конспекты по 30 темам с задачами по возрастанию сложности</span></a>' +
            '<a class="tile" href="#/skills"><b>🧩 Теоремы и приёмы</b><span>все теоремы из решений и задачи на них</span></a>' +
            '<a class="tile" href="#/authors"><b>✍️ Авторы</b><span>задачи по авторам</span></a>' +
            '</div>';
        app.innerHTML = h;
        document.getElementById('hero-search').addEventListener('submit', function (e) {
            e.preventDefault();
            location.hash = '#/problems?' + buildQuery({ q: this.elements.q.value.trim() });
        });
    }

    function pageOlympiads() {
        setTitle('Олимпиады');
        var h = crumbs([['Все олимпиады', '#/olympiads'], ['Математика', '']]);
        TREE.forEach(function (g) {
            h += '<div class="tree-group"><h4>' + esc(g.title) + '</h4><div class="grid">';
            g.comps.forEach(function (c) {
                var s = compStats(c);
                h += '<a class="tile" href="#/n/' + c + '"><b>' + esc(DB.comps[c]) + '</b><span>' + s.from + '–' + s.to + ' · ' + s.n + ' задач' + (s.solved ? ' · решено ' + s.solved : '') + '</span></a>';
            });
            h += '</div></div>';
        });
        app.innerHTML = h;
    }

    function olyProgress(oid) {
        var ps = BY_OLY[oid] || [];
        var s = ps.filter(function (p) { return isSolved(p.id); }).length;
        return s ? ' <span class="cnt">' + s + '/' + ps.length + '</span>' : '';
    }
    function pageComp(c) {
        if (!DB.comps[c]) return notFound();
        setTitle(COMP_SHORT[c]);
        var list = DB.olympiads.filter(function (o) { return o.comp === c; });
        var h = crumbs([['Все олимпиады', '#/olympiads'], ['Математика', '#/olympiads'], [DB.comps[c], '']]);
        h += '<div class="page-title"><h2>' + esc(DB.comps[c]) + '</h2>' +
            '<div class="page-sub"><a href="#/problems?comp=' + c + '">все задачи списком с фильтрами</a></div></div>';
        h += '<div class="year-grid">';
        if (c.indexOf('resp') === 0) {
            var years = {};
            list.forEach(function (o) { (years[o.year] = years[o.year] || []).push(o); });
            Object.keys(years).sort().reverse().forEach(function (y) {
                h += '<div class="year-cell"><div class="y">' + (y - 1) + '-' + y + ' учебный год</div>' +
                    years[y].sort(function (a, b) { return a.grade - b.grade; }).map(function (o) {
                        return '<a href="#/o/' + o.oid + '">' + o.grade + ' класс</a>' + olyProgress(o.oid);
                    }).join(' ') + '</div>';
            });
        } else {
            list.sort(function (a, b) { return b.year - a.year; }).forEach(function (o) {
                h += '<a class="year-cell" href="#/o/' + o.oid + '"><div class="y">' + esc(COMP_SHORT[c]) + ' ' + o.year + olyProgress(o.oid) + '</div>' +
                    '<span class="cnt">' + (BY_OLY[o.oid] || []).length + ' задач</span></a>';
            });
        }
        app.innerHTML = h + '</div>';
    }

    function pageOlympiad(oid) {
        var o = OLY[oid];
        if (!o) return notFound();
        setTitle(olyName(o));
        var probs = BY_OLY[o.oid] || [];
        var h = crumbs([['Все олимпиады', '#/olympiads'], ['Математика', '#/olympiads'],
            [DB.comps[o.comp], '#/n/' + o.comp], [String(o.year) + (o.grade ? ', ' + o.grade + ' класс' : ''), '']]);
        h += '<div class="page-title"><h2>' + esc(o.title) + '</h2>' +
            '<div class="page-sub"><a href="https://matol.kz/olympiads/' + o.oid + '" target="_blank" rel="noopener">оригинал на matol.kz ↗</a></div></div>';
        h += probs.map(function (p) { return problemHtml(p); }).join('');
        h += siblingOlys(o);
        app.innerHTML = h;
        fillReveals(app);
    }
    function siblingOlys(o) {
        var same = DB.olympiads.filter(function (x) { return x.comp === o.comp; })
            .sort(function (a, b) { return a.year - b.year || (a.grade || 0) - (b.grade || 0); });
        var i = same.indexOf(o);
        return '<div class="pager-row">' +
            (i > 0 ? '<a class="btn btn-default btn-sm" href="#/o/' + same[i - 1].oid + '">← ' + esc(olyName(same[i - 1])) + '</a> ' : '') +
            (i < same.length - 1 ? '<a class="btn btn-default btn-sm" href="#/o/' + same[i + 1].oid + '">' + esc(olyName(same[i + 1])) + ' →</a>' : '') +
            '</div>';
    }

    function problemCrumbs(p, last) {
        var o = OLY[p.oid];
        return crumbs([['Все олимпиады', '#/olympiads'], [DB.comps[o.comp], '#/n/' + o.comp],
            [olyName(o), '#/o/' + o.oid], ['Задача №' + p.num, last ? '#/p/' + p.id : ''], last ? [last, ''] : null].filter(Boolean));
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
        sub: function (v) { return v; }, comp: function (v) { return COMP_SHORT[v]; }, grade: function (v) { return v + ' класс'; },
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
        h += '<div class="seg"><a href="' + withQ(f, { comp: '' }) + '" class="' + (!f.comp ? 'on' : '') + '">Все олимпиады</a>' +
            COMP_ORDER.map(function (c) {
                return '<a href="' + withQ(f, { comp: c }) + '" class="' + (f.comp === c ? 'on' : '') + '">' + COMP_SHORT[c] + '</a>';
            }).join('') + '</div>';

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
        var list = DB.problems.filter(function (p) { return tab === 'star' ? isStar(p.id) : isSolved(p.id); });
        var nStar = DB.problems.filter(function (p) { return isStar(p.id); }).length;
        var nSol = DB.problems.filter(function (p) { return isSolved(p.id); }).length;
        var h = crumbs([['Главная', '#/'], ['Мои задачи', '']]);
        h += '<div class="seg"><a href="#/marked?tab=star" class="' + (tab === 'star' ? 'on' : '') + '">★ Избранное (' + nStar + ')</a>' +
            '<a href="#/marked?tab=solved" class="' + (tab === 'solved' ? 'on' : '') + '">✓ Решённые (' + nSol + ')</a></div>';
        h += '<p class="text-muted" style="font-size:12px">Отметки хранятся только в этом браузере.</p>';
        if (!list.length) h += '<div class="card text-muted">Пока пусто. Отмечай задачи кнопками ✓ и ☆ в правом верхнем углу карточки.</div>';
        else if (tab === 'star') h += list.map(function (p) { return problemHtml(p, { withSource: true }); }).join('');
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
            var on = n === sec || (n === 'olympiads' && /^(n|o)$/.test(sec)) || (n === 'problems' && /^(p|c)$/.test(sec)) || (n === 'authors' && sec === 'author');
            li.classList.toggle('active', on);
        });
        if (!parts.length) pageHome();
        else if (sec === 'olympiads') pageOlympiads();
        else if (sec === 'n') pageComp(parts[1]);
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
