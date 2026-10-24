/* matol mod — single-page app over /data/index.json and /data/o/<oid>.json */
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
    var PAGE_SIZE = 20;

    var DB = null;          // index.json
    var OLY = {};           // oid -> olympiad
    var PROB = {};          // id -> problem
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
    function typeset(el) {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.startup.promise.then(function () { return MathJax.typesetPromise([el]); }).catch(function () {});
        } else {
            setTimeout(function () { typeset(el); }, 300);
        }
    }
    function store(key, val) {
        try {
            if (val === undefined) return JSON.parse(localStorage.getItem(key) || '{}');
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) { return {}; }
    }
    var marks = store('mm-marks') || {};   // id -> {solved:bool, star:bool}
    function setMark(id, k) {
        marks[id] = marks[id] || {};
        marks[id][k] = !marks[id][k];
        store('mm-marks', marks);
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
            return i === items.length - 1 ? '<li class="active">' + esc(it[0]) + '</li>'
                : '<li><a href="' + it[1] + '">' + esc(it[0]) + '</a></li>';
        }).join('') + '</ol>';
    }

    // ---------- problem rendering ----------
    function metaHtml(p) {
        var h = '';
        if (p.topic) h += '<a class="label t-' + p.topic + '" href="#/problems?topic=' + p.topic + '">' + TOPICS[p.topic] + '</a>';
        if (p.diff) h += '<a class="label diff diff-' + p.diff + '" href="#/problems?dmin=' + p.diff + '&dmax=' + p.diff + '" title="Сложность по шкале 1–10">сложность ' + p.diff + '/10</a>';
        (p.sub || []).forEach(function (s) {
            h += '<a class="label sub-tag" href="#/problems?sub=' + encodeURIComponent(s) + '">' + esc(s) + '</a>';
        });
        if (p.src === 'ai') h += '<span class="label src-ai" title="Решение написано ИИ — может содержать ошибки">решение: ИИ' + (p.conf && p.conf !== 'high' ? ' (' + (p.conf === 'medium' ? 'проверить' : 'неполное') + ')' : '') + '</span>';
        if (p.src === 'matol') h += '<span class="label src-matol" title="Решение по материалам matol.kz, проверено и переписано">решение: matol</span>';
        return h;
    }
    function marksHtml(p) {
        var m = marks[p.id] || {};
        return '<span class="pmarks">' +
            '<a data-mark="solved" data-id="' + p.id + '" class="' + (m.solved ? 'on' : '') + '">' + (m.solved ? '✓ решена' : '○ решена') + '</a>' +
            '<a data-mark="star" data-id="' + p.id + '" class="' + (m.star ? 'on' : '') + '">' + (m.star ? '★ в избранном' : '☆ в избранное') + '</a>' +
            '</span>';
    }
    function problemHtml(p, opts) {
        opts = opts || {};
        var o = OLY[p.oid];
        var title = opts.withSource
            ? '<a href="#/p/' + p.id + '"><b>' + esc(olyName(o)) + ', задача №' + esc(p.num) + '</b></a>'
            : '<a href="#/p/' + p.id + '" style="color:inherit"><b>Задача №' + esc(p.num) + '.</b></a>';
        return '<div class="problem" id="p-' + p.id + '">' +
            marksHtml(p) +
            '<div class="stmt">' + title + '&nbsp; ' + p.st + '</div>' +
            '<div class="pmeta">' + metaHtml(p) + '</div>' +
            '<div class="reveals" data-reveals="' + p.id + '"></div>' +
            '<hr></div>';
    }
    function spoiler(title, body, extra) {
        return '<div class="rv"><div class="rv-title">' + title + (extra || '') + '</div>' +
            '<div class="spoiler" title="Нажми, чтобы открыть"><div class="sp-body">' + body + '</div></div></div>';
    }
    function revealsHtml(p, d) {
        var h = '';
        var isGeo = p.topic === 'geometry';
        if (d.skills && d.skills.length) {
            h += spoiler('Какие теоремы и приёмы нужны',
                '<ul class="skill-list">' + d.skills.map(function (s) {
                    return '<li><a class="skill-link" href="#/problems?skill=' + encodeURIComponent(s.name) + '"><b>' + md(s.name).replace(/^<p>|<\/p>\s*$/g, '') + '</b></a>' +
                        (s.note ? ' — <span class="note">' + md(s.note).replace(/^<p>|<\/p>\s*$/g, '') + '</span>' : '') + '</li>';
                }).join('') + '</ul>');
        }
        (d.hints || []).forEach(function (hint, i) {
            h += spoiler('Подсказка ' + (i + 1) + ' <span class="muted">из ' + d.hints.length + '</span>', md(hint));
        });
        if (d.solution) {
            var body = '';
            if (d.answer) body += '<div class="answer-box"><b>Ответ:</b> ' + md(d.answer).replace(/^<p>|<\/p>\s*$/g, '') + '</div>';
            if (p.src === 'ai' && p.conf !== 'high') body += '<div class="warn-box">Решение написано ИИ' + (p.conf === 'low' ? ' и, скорее всего, неполное' : ' — некоторые места стоит перепроверить') + '. Сверься с обсуждением на matol.</div>';
            body += md(d.solution);
            h += spoiler('Решение', body, p.src === 'ai' ? ' <span class="muted">(ИИ)</span>' : ' <span class="muted">(по matol)</span>');
        } else if (isGeo) {
            h += '<div class="rv"><div class="rv-title"><span class="muted">Геометрия: подсказки и решение ИИ не пишутся — см. обсуждение на matol ниже.</span></div></div>';
        }
        if (d.comments && d.comments.length) {
            h += spoiler('Обсуждение на matol <span class="muted">(' + d.comments.length + ')</span>',
                d.comments.map(function (c) {
                    return '<div class="mat-comment level' + Math.min(c.level, 3) + '"><div class="chead">' + esc(c.author || 'гость') +
                        (c.votes ? ' · ' + (c.votes > 0 ? '+' : '') + c.votes : '') + '</div>' + c.html + '</div>';
                }).join('') +
                '<div class="src-line"><a href="https://matol.kz/comments/' + d.cid + '/show" target="_blank" rel="noopener">открыть на matol.kz ↗</a></div>');
        } else if (!d.solution && !isGeo) {
            h += '<div class="rv"><div class="rv-title"><span class="muted">Решение пока не добавлено.</span></div></div>';
        }
        return h;
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

    // global click handling: spoilers, marks, navbar
    document.addEventListener('click', function (e) {
        var sp = e.target.closest && e.target.closest('.spoiler');
        if (sp && !sp.classList.contains('open')) {
            sp.classList.add('open');
            e.preventDefault();
            return;
        }
        var mk = e.target.closest && e.target.closest('[data-mark]');
        if (mk) {
            var id = mk.getAttribute('data-id'), k = mk.getAttribute('data-mark');
            setMark(id, k);
            var on = marks[id][k];
            mk.classList.toggle('on', on);
            mk.textContent = k === 'solved' ? (on ? '✓ решена' : '○ решена') : (on ? '★ в избранном' : '☆ в избранное');
            return;
        }
        if (e.target.closest && e.target.closest('#navtoggle')) {
            document.getElementById('navmenu').classList.toggle('in');
        } else if (e.target.closest && e.target.closest('#navmenu a')) {
            document.getElementById('navmenu').classList.remove('in');
        }
    });

    // ---------- pages ----------
    function pageHome() {
        var n = DB.problems.length;
        var ann = DB.problems.filter(function (p) { return p.topic; }).length;
        var withSol = DB.problems.filter(function (p) { return p.src && p.src !== 'none'; }).length;
        var byTopic = {};
        DB.problems.forEach(function (p) { if (p.topic) byTopic[p.topic] = (byTopic[p.topic] || 0) + 1; });
        var solved = Object.keys(marks).filter(function (k) { return marks[k].solved && PROB[k]; }).length;
        var h = crumbs([['Главная', '#/']]);
        h += '<div style="text-align:center"><h2>Олимпиадная математика: задачи, темы, подсказки</h2></div><br>';
        h += '<div class="row stat-grid">';
        h += '<div class="col-sm-4"><div class="panel panel-default"><div class="panel-heading"><b>Задачи</b></div><div class="panel-body">' +
            'Всего задач: <b>' + n + '</b><br>Размечено (тема, сложность): <b>' + ann + '</b><br>С решением: <b>' + withSol + '</b><br>Решено тобой: <b>' + solved + '</b></div></div></div>';
        h += '<div class="col-sm-4"><div class="panel panel-default"><div class="panel-heading"><b>По темам</b></div><div class="panel-body">' +
            Object.keys(TOPICS).map(function (t) {
                return '<a href="#/problems?topic=' + t + '">' + TOPICS[t] + '</a>: ' + (byTopic[t] || 0);
            }).join('<br>') + '</div></div></div>';
        h += '<div class="col-sm-4"><div class="panel panel-default"><div class="panel-heading"><b>Олимпиады</b></div><div class="panel-body">' +
            COMP_ORDER.map(function (c) {
                return '<a href="#/problems?comp=' + c + '">' + esc(COMP_SHORT[c]) + '</a>';
            }).join('<br>') + '</div></div></div>';
        h += '</div>';
        h += '<p><a class="btn btn-primary" href="#/problems">Все задачи с фильтрами</a> ' +
            '<a class="btn btn-default" href="#/olympiads">Олимпиады по годам</a> ' +
            '<a class="btn btn-default" href="#/theory">Теория (конспекты)</a> ' +
            '<a class="btn btn-default" href="#/skills">Теоремы и приёмы</a> ' +
            '<a class="btn btn-default" href="#/random">Случайная задача</a></p>';
        h += '<p class="text-muted" style="font-size:13px">Под каждой задачей скрыты блоки «Какие теоремы и приёмы нужны», подсказки и решение. Нажми на размытый блок, чтобы его открыть. ' +
            'Геометрию ИИ не решает: у геометрических задач есть только тема, сложность и обсуждение с matol.</p>';
        app.innerHTML = h;
    }

    function pageOlympiads() {
        var h = crumbs([['Все олимпиады', '#/olympiads'], ['Математика', '#/olympiads']]);
        h += '<div class="otree">';
        COMP_ORDER.forEach(function (c) {
            var list = DB.olympiads.filter(function (o) { return o.comp === c; });
            h += '<h4>' + esc(DB.comps[c]) + '</h4>';
            if (c.indexOf('resp') === 0) {
                var years = {};
                list.forEach(function (o) { (years[o.year] = years[o.year] || []).push(o); });
                Object.keys(years).sort().reverse().forEach(function (y) {
                    h += '<div class="grades">' + (y - 1) + '-' + y + ' учебный год: ' +
                        years[y].sort(function (a, b) { return a.grade - b.grade; }).map(function (o) {
                            return '<a href="#/o/' + o.oid + '">' + o.grade + ' класс</a>';
                        }).join('') + '</div>';
                });
            } else {
                h += '<div class="years">' + list.sort(function (a, b) { return b.year - a.year; }).map(function (o) {
                    return '<a href="#/o/' + o.oid + '">' + esc(COMP_SHORT[c]) + ' ' + o.year + '</a>';
                }).join('') + '</div>';
            }
        });
        app.innerHTML = h + '</div>';
    }

    function pageOlympiad(oid) {
        var o = OLY[oid];
        if (!o) return notFound();
        var probs = DB.problems.filter(function (p) { return p.oid === o.oid; });
        var h = crumbs([['Все олимпиады', '#/olympiads'], ['Математика', '#/olympiads'],
            [COMP_SHORT[o.comp], '#/problems?comp=' + o.comp], [String(o.year) + (o.grade ? ', ' + o.grade + ' класс' : ''), '']]);
        h += '<div style="text-align:center"><h2>' + esc(o.title) + '</h2>' +
            '<div class="src-line"><a href="https://matol.kz/olympiads/' + o.oid + '" target="_blank" rel="noopener">оригинал на matol.kz ↗</a></div></div><br>';
        h += '<div style="border-top: 1px solid #eee; margin-bottom: 10px"></div>';
        h += probs.map(function (p) { return problemHtml(p); }).join('');
        app.innerHTML = h;
        fillReveals(app);
    }

    function pageProblem(id) {
        var p = PROB[id];
        if (!p) return notFound();
        var o = OLY[p.oid];
        var siblings = DB.problems.filter(function (q) { return q.oid === p.oid; });
        var i = siblings.indexOf(p);
        var h = crumbs([['Все олимпиады', '#/olympiads'], [COMP_SHORT[o.comp], '#/problems?comp=' + o.comp],
            [olyName(o), '#/o/' + o.oid], ['Задача №' + p.num, '']]);
        h += problemHtml(p);
        h += '<div class="pager-row">' +
            (i > 0 ? '<a class="btn btn-default btn-sm" href="#/p/' + siblings[i - 1].id + '">← предыдущая</a> ' : '') +
            '<a class="btn btn-default btn-sm" href="#/o/' + o.oid + '">вся олимпиада</a> ' +
            (i < siblings.length - 1 ? '<a class="btn btn-default btn-sm" href="#/p/' + siblings[i + 1].id + '">следующая →</a>' : '') +
            '</div>';
        app.innerHTML = h;
        fillReveals(app);
        window.scrollTo(0, 0);
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
            if (f.sol === '1' && !(p.src && p.src !== 'none')) return false;
            if (f.sol === 'high' && !(p.src && p.src !== 'none' && p.conf === 'high')) return false;
            if (f.st === 'unsolved' && marks[p.id] && marks[p.id].solved) return false;
            if (f.st === 'solved' && !(marks[p.id] && marks[p.id].solved)) return false;
            if (f.st === 'star' && !(marks[p.id] && marks[p.id].star)) return false;
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

    function pageProblems(f) {
        var list = sortProblems(filterProblems(f), f.sort);
        var page = Math.max(1, +f.page || 1);
        var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        var years = [];
        for (var y = 1990; y <= 2026; y++) years.push(y);
        var diffs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        var h = crumbs([['Главная', '#/'], ['Задачи', '']]);
        h += '<form class="filters" id="filters"><div class="row">';
        h += '<div class="col-sm-3 form-group"><label>Тема</label><select class="form-control input-sm" name="topic">' + opt('', 'все темы', f.topic) +
            Object.keys(TOPICS).map(function (t) { return opt(t, TOPICS[t], f.topic); }).join('') + '</select></div>';
        h += '<div class="col-sm-3 form-group"><label>Подтема</label><select class="form-control input-sm" name="sub">' + opt('', 'все', f.sub) +
            allSubtopics(f.topic).map(function (s) { return opt(s[0], s[0] + ' (' + s[1] + ')', f.sub); }).join('') + '</select></div>';
        h += '<div class="col-sm-3 form-group"><label>Олимпиада</label><select class="form-control input-sm" name="comp">' + opt('', 'все', f.comp) +
            COMP_ORDER.map(function (c) { return opt(c, COMP_SHORT[c], f.comp); }).join('') + '</select></div>';
        h += '<div class="col-sm-3 form-group"><label>Класс (для респы)</label><select class="form-control input-sm" name="grade">' + opt('', 'любой', f.grade) +
            opt('9', '9', f.grade) + opt('10', '10', f.grade) + opt('11', '11', f.grade) + '</select></div>';
        h += '</div><div class="row">';
        h += '<div class="col-sm-3 col-xs-6 form-group"><label>Сложность от</label><select class="form-control input-sm" name="dmin">' + opt('', '—', f.dmin) +
            diffs.map(function (d) { return opt(d, d, f.dmin); }).join('') + '</select></div>';
        h += '<div class="col-sm-3 col-xs-6 form-group"><label>Сложность до</label><select class="form-control input-sm" name="dmax">' + opt('', '—', f.dmax) +
            diffs.map(function (d) { return opt(d, d, f.dmax); }).join('') + '</select></div>';
        h += '<div class="col-sm-3 col-xs-6 form-group"><label>Год от</label><select class="form-control input-sm" name="ymin">' + opt('', '—', f.ymin) +
            years.map(function (d) { return opt(d, d, f.ymin); }).join('') + '</select></div>';
        h += '<div class="col-sm-3 col-xs-6 form-group"><label>Год до</label><select class="form-control input-sm" name="ymax">' + opt('', '—', f.ymax) +
            years.map(function (d) { return opt(d, d, f.ymax); }).join('') + '</select></div>';
        h += '</div><div class="row">';
        h += '<div class="col-sm-3 form-group"><label>Теорема / приём</label><input class="form-control input-sm" name="skill" list="skill-list" placeholder="напр. Ферма, AM-GM" value="' + esc(f.skill) + '"></div>';
        h += '<div class="col-sm-3 form-group"><label>Поиск в условии</label><input class="form-control input-sm" name="q" placeholder="слово из условия" value="' + esc(f.q) + '"></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>Решение</label><select class="form-control input-sm" name="sol">' + opt('', 'любые', f.sol) +
            opt('1', 'только с решением', f.sol) + opt('high', 'надёжное решение', f.sol) + '</select></div>';
        h += '<div class="col-sm-2 col-xs-6 form-group"><label>Мои отметки</label><select class="form-control input-sm" name="st">' + opt('', 'все', f.st) +
            opt('unsolved', 'нерешённые', f.st) + opt('solved', 'решённые', f.st) + opt('star', 'избранное', f.st) + '</select></div>';
        h += '<div class="col-sm-2 form-group"><label>Сортировка</label><select class="form-control input-sm" name="sort">' + opt('', 'по олимпиадам', f.sort) +
            opt('diff', 'легче → сложнее', f.sort) + opt('-diff', 'сложнее → легче', f.sort) + opt('-year', 'новые сначала', f.sort) + opt('year', 'старые сначала', f.sort) + '</select></div>';
        h += '</div><datalist id="skill-list">' + skillCounts().slice(0, 400).map(function (s) { return '<option value="' + esc(s[0]) + '">'; }).join('') + '</datalist>';
        h += '<div class="form-group"><a class="btn btn-default btn-sm" href="#/problems">Сбросить</a> ' +
            '<a class="btn btn-default btn-sm" href="#/random?' + buildQuery(Object.assign({}, f, { page: '' })) + '">Случайная из найденных</a></div>';
        h += '</form>';
        h += '<div class="result-count">Найдено задач: <b>' + list.length + '</b>' + (pages > 1 ? ' · страница ' + page + ' из ' + pages : '') + '</div>';
        h += list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(function (p) { return problemHtml(p, { withSource: true }); }).join('');
        if (pages > 1) {
            h += '<div class="pager-row">';
            if (page > 1) h += '<a class="btn btn-default btn-sm" href="#/problems?' + buildQuery(Object.assign({}, f, { page: page - 1 })) + '">← назад</a> ';
            if (page < pages) h += '<a class="btn btn-default btn-sm" href="#/problems?' + buildQuery(Object.assign({}, f, { page: page + 1 })) + '">дальше →</a>';
            h += '</div>';
        }
        app.innerHTML = h;
        var form = document.getElementById('filters');
        function apply() {
            var nf = {};
            Array.prototype.forEach.call(form.elements, function (el) { if (el.name) nf[el.name] = el.value; });
            if (nf.topic !== (f.topic || '')) nf.sub = '';
            location.hash = '#/problems?' + buildQuery(nf);
        }
        form.addEventListener('change', apply);
        form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
        fillReveals(app);
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
        var h = crumbs([['Главная', '#/'], ['Теоремы и приёмы', '']]);
        h += '<p class="text-muted">Теоремы, леммы и приёмы, которые встречаются в решениях. Число — сколько задач их используют. Нажми, чтобы увидеть эти задачи.</p>';
        ['algebra', 'combinatorics', 'number_theory'].forEach(function (t) {
            var list = skillCounts(t);
            h += '<h4 style="color:#19C">' + TOPICS[t] + '</h4><div class="skill-index">' +
                (list.length ? list.map(function (s) {
                    return '<a href="#/problems?topic=' + t + '&skill=' + encodeURIComponent(s[0]) + '">' + esc(s[0]) + ' <span class="cnt">' + s[1] + '</span></a>';
                }).join('') : '<span class="text-muted">пока пусто</span>') + '</div>';
        });
        app.innerHTML = h;
        typeset(app);
    }

    function pageRandom(f) {
        var list = filterProblems(f);
        if (!list.length) { app.innerHTML = '<p>Под эти фильтры задач нет. <a href="#/problems">К задачам</a></p>'; return; }
        var p = list[Math.floor(Math.random() * list.length)];
        location.replace('#/p/' + p.id);
    }

    function pageMarked() {
        var solved = DB.problems.filter(function (p) { return marks[p.id] && marks[p.id].solved; });
        var star = DB.problems.filter(function (p) { return marks[p.id] && marks[p.id].star; });
        var h = crumbs([['Главная', '#/'], ['Мои отметки', '']]);
        h += '<p class="text-muted" style="font-size:12px">Отметки хранятся только в этом браузере.</p>';
        h += '<h4>Избранное (' + star.length + ')</h4>' + (star.length ? star.map(function (p) { return problemHtml(p, { withSource: true }); }).join('') : '<p class="text-muted">пусто</p>');
        h += '<h4>Решённые (' + solved.length + ')</h4>' + (solved.length ? solved.map(function (p) {
            return '<div><a href="#/p/' + p.id + '">' + esc(olyName(OLY[p.oid])) + ', №' + esc(p.num) + '</a> ' + metaHtml(p) + '</div>';
        }).join('') : '<p class="text-muted">пусто</p>');
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
        loadTheory().then(function (th) {
            var h = crumbs([['Главная', '#/'], ['Теория', '']]);
            h += '<p class="text-muted">Конспекты по темам. В каждой теме есть задачи из базы по возрастанию сложности. Конспекты написаны ИИ, проверяй важные утверждения. Геометрия в этот блок пока не входит.</p>';
            ['algebra', 'number_theory', 'combinatorics'].forEach(function (a) {
                h += '<h4 style="color:#19C">' + TOPICS[a] + '</h4><div class="skill-index">' +
                    th.filter(function (t) { return t.area === a; }).map(function (t) {
                        return '<a href="#/theory/' + t.id + '">' + esc(t.title) + ' <span class="cnt">' + t.problems.length + (t.note ? '' : ' · конспект готовится') + '</span></a>';
                    }).join('') + '</div>';
            });
            app.innerHTML = h;
        });
    }
    function pageTheoryTopic(id) {
        loadTheory().then(function (th) {
            var t = th.filter(function (x) { return x.id === id; })[0];
            if (!t) return notFound();
            var h = crumbs([['Главная', '#/'], ['Теория', '#/theory'], [t.title, '']]);
            h += '<h3>' + esc(t.title) + '</h3>';
            if (t.note) {
                var body = md(t.note).replace(/\[\[(m[\w\-.]+)\]\]/g, function (_, pid) {
                    return PROB[pid] ? '<a href="#/p/' + pid + '">' + esc(olyName(OLY[PROB[pid].oid])) + ', №' + esc(PROB[pid].num) + '</a>' : pid;
                });
                h += '<div class="theory-note">' + body + '</div>';
            } else {
                h += '<p class="text-muted">Конспект по этой теме ещё не написан.</p>';
            }
            h += '<h4 style="margin-top:25px">Задачи по теме (от лёгких к сложным)</h4>';
            var ps = t.problems.filter(function (p) { return PROB[p.id]; });
            if (!ps.length) h += '<p class="text-muted">Пока нет размеченных задач.</p>';
            var cur = null;
            ps.forEach(function (p) {
                var d = p.diff || 0;
                if (d !== cur) { cur = d; h += '<div class="rv-title" style="margin-top:12px">' + (d ? 'сложность ' + d + '/10' : 'сложность не указана') + '</div>'; }
                var q = PROB[p.id];
                h += '<div style="margin:3px 0"><a href="#/p/' + q.id + '">' + esc(olyName(OLY[q.oid])) + ', №' + esc(q.num) + '</a> ' + metaHtml(q) + '</div>';
            });
            app.innerHTML = h;
            typeset(app);
        });
    }

    function notFound() {
        app.innerHTML = '<p style="margin-top:30px">Страница не найдена. <a href="#/">На главную</a></p>';
    }

    // ---------- router ----------
    function route() {
        var hash = location.hash.replace(/^#/, '') || '/';
        var qi = hash.indexOf('?');
        var path = qi >= 0 ? hash.slice(0, qi) : hash;
        var f = parseQuery(qi >= 0 ? hash.slice(qi + 1) : '');
        var parts = path.split('/').filter(Boolean);
        if (!parts.length) pageHome();
        else if (parts[0] === 'olympiads') pageOlympiads();
        else if (parts[0] === 'o') pageOlympiad(+parts[1]);
        else if (parts[0] === 'p') pageProblem(decodeURIComponent(parts[1]));
        else if (parts[0] === 'problems') pageProblems(f);
        else if (parts[0] === 'skills') pageSkills();
        else if (parts[0] === 'theory') { if (parts[1]) pageTheoryTopic(parts[1]); else pageTheory(); }
        else if (parts[0] === 'random') pageRandom(f);
        else if (parts[0] === 'marked') pageMarked();
        else notFound();
        if (parts[0] !== 'p' && parts[0] !== 'problems') window.scrollTo(0, 0);
        if (parts[0] === 'problems' && !f.page) { /* keep position on filter change */ }
    }

    fetch('/data/index.json').then(function (r) { return r.json(); }).then(function (db) {
        DB = db;
        db.olympiads.forEach(function (o) { OLY[o.oid] = o; });
        db.problems.forEach(function (p) { PROB[p.id] = p; });
        window.addEventListener('hashchange', route);
        route();
    }).catch(function (e) {
        app.innerHTML = '<p class="text-danger">Не удалось загрузить данные: ' + esc(e) + '</p>';
    });
})();
