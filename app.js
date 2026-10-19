/* ============================================================
   Hala v2 — app logic. Pure static, no network, no libraries.
   Depends on window.HALA_DATA (data.js) and window.HALA_I18N (i18n.js).
   Every UI string renders through t() from the i18n dictionary.
   Team names are always official Latin script, wrapped in <bdi>.
   ============================================================ */

'use strict';

var DATA = window.HALA_DATA;
var I18N = window.HALA_I18N;

/* ---------- state ---------- */

var state = {
  lang: 'fa',
  comp: 'PL',
  cmpA: '',
  cmpB: '',
  h2hA: '',
  h2hB: '',
  trendSel: [] // team ids, max 5
};

var LS_KEY = 'hala.lang';
var LINE_COLORS = ['#00e676', '#ffc24b', '#5aa9ff', '#c792ff', '#ff7ab8'];
/* match tuple layout in data.js: [hId, aId, matchday, status, hg, ag, utcDate]
   status: 0 = FINISHED, 1 = SCHEDULED, 2 = TIMED */

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function $(id) { return document.getElementById(id); }

function bdi(s) { return '<bdi>' + esc(s) + '</bdi>'; }

/* ---------- i18n ---------- */

var LOCALE_TAG = { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB' };
var fmtCache = {};

function localeTag() { return LOCALE_TAG[state.lang] || 'fa-IR'; }

function t(key, vars) {
  var dict = I18N[state.lang] || I18N.fa;
  var s = dict[key] != null ? dict[key] : (I18N.en[key] != null ? I18N.en[key] : key);
  if (vars) {
    for (var k in vars) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    }
  }
  return s;
}

function nf() {
  var tag = localeTag();
  if (!fmtCache[tag]) fmtCache[tag] = new Intl.NumberFormat(tag);
  return fmtCache[tag];
}

function fmtN(x) { return nf().format(x); }

function fmtDate(iso) {
  return new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short' })
    .format(new Date(iso.length > 10 ? iso : iso + 'T12:00:00Z'));
}

function fmtDT(iso) {
  return new Intl.DateTimeFormat(localeTag(), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

/* percent string with locale digits: format the number, append % */
function pctStr(x) {
  return nf().format(Math.round(x * 10) / 10) + '%';
}

/* ---------- data access ---------- */

function compById(id) {
  for (var i = 0; i < DATA.comps.length; i++) {
    if (DATA.comps[i].id === id) return DATA.comps[i];
  }
  return DATA.comps[0];
}

function teamOf(comp, tid) {
  for (var i = 0; i < comp.teams.length; i++) {
    if (comp.teams[i][0] === tid) return comp.teams[i];
  }
  return null;
}

function teamName(comp, tid) {
  var tm = teamOf(comp, tid);
  return tm ? tm[1] : '?';
}

function teamTla(comp, tid) {
  var tm = teamOf(comp, tid);
  return tm && tm[2] ? tm[2] : '?';
}

function rowOf(comp, tid) {
  for (var i = 0; i < comp.table.length; i++) {
    if (comp.table[i][1] === tid) return comp.table[i];
  }
  return null;
}

/* FINISHED matches involving tid, chronological by utcDate */
function teamMatches(comp, tid) {
  var out = [];
  for (var i = 0; i < comp.m.length; i++) {
    var m = comp.m[i];
    if (m[3] === 0 && (m[0] === tid || m[1] === tid)) out.push(m);
  }
  out.sort(function (a, b) { return a[6] < b[6] ? -1 : (a[6] > b[6] ? 1 : 0); });
  return out;
}

/* result from the perspective of tid: 'W' | 'D' | 'L' */
function resultFor(m, tid) {
  var gf = m[0] === tid ? m[4] : m[5];
  var ga = m[0] === tid ? m[5] : m[4];
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}

function pointsFor(r) { return r === 'W' ? 3 : r === 'D' ? 1 : 0; }

function chipTitle(comp, m) {
  var hName = teamName(comp, m[0]), aName = teamName(comp, m[1]);
  return t('form.chipMatch', {
    home: bdi(hName),
    hg: '<bdi>' + fmtN(m[4]) + '</bdi>',
    ag: '<bdi>' + fmtN(m[5]) + '</bdi>',
    away: bdi(aName),
    date: '<bdi>' + esc(fmtDate(m[6])) + '</bdi>'
  });
}

function chipText(comp, m) {
  /* plain-text version of chipTitle for the title="" tooltip:
     no <bdi> tags (they would render as literal text in tooltips) */
  var hName = teamName(comp, m[0]), aName = teamName(comp, m[1]);
  return hName + ' ' + fmtN(m[4]) + '–' + fmtN(m[5]) + ' ' + aName + ' · ' + fmtDate(m[6]);
}

function formChipsHTML(comp, tid, n) {
  var ms = teamMatches(comp, tid).slice(-n);
  return '<span class="form-chips">' + ms.map(function (m) {
    var r = resultFor(m, tid);
    return '<span class="chip ' + r.toLowerCase() + '" title="' + esc(chipText(comp, m)) + '">' + r + '</span>';
  }).join('') + '</span>';
}

/* W/D/L legend for the form chips (spec §9: adjacent legend on first use) */
function chipKeyHTML() {
  function item(cls, letter, key) {
    return '<span class="key-item"><span class="chip ' + cls + '">' + letter + '</span> ' +
      esc(t(key)) + '</span>';
  }
  return '<span class="chips-key">' + item('w', 'W', 'form.chipWin') +
    item('d', 'D', 'form.chipDraw') + item('l', 'L', 'form.chipLoss') + '</span>';
}

function upcomingFixtures(comp, n) {
  var out = [];
  for (var i = 0; i < comp.m.length; i++) {
    if (comp.m[i][3] > 0) out.push(comp.m[i]);
  }
  out.sort(function (a, b) { return a[6] < b[6] ? -1 : (a[6] > b[6] ? 1 : 0); });
  return out.slice(0, n);
}

/* last-10 W/D/L rates — byte-identical math to v1 */
function wdlRates(ms, tid) {
  var w = 0, d = 0, l = 0;
  for (var i = 0; i < ms.length; i++) {
    var r = resultFor(ms[i], tid);
    if (r === 'W') w++; else if (r === 'D') d++; else l++;
  }
  var n = ms.length || 1;
  return { w: w, d: d, l: l, n: ms.length, wR: w / n, dR: d / n, lR: l / n };
}

function predict(comp, tidA, tidB) {
  var aForm = wdlRates(teamMatches(comp, tidA).slice(-10), tidA);
  var bForm = wdlRates(teamMatches(comp, tidB).slice(-10), tidB);
  var meetings = [];
  for (var i = 0; i < comp.m.length; i++) {
    var m = comp.m[i];
    if (m[3] === 0 && ((m[0] === tidA && m[1] === tidB) || (m[0] === tidB && m[1] === tidA))) {
      meetings.push(m);
    }
  }
  meetings.sort(function (a, b) { return a[6] < b[6] ? -1 : 1; });
  var aWins = 0, draws = 0, bWins = 0, totalGoals = 0;
  for (var j = 0; j < meetings.length; j++) {
    var mm = meetings[j];
    totalGoals += mm[4] + mm[5];
    var ra = resultFor(mm, tidA);
    if (ra === 'W') aWins++; else if (ra === 'D') draws++; else bWins++;
  }
  var h2hN = meetings.length;
  var hA = h2hN ? aWins / h2hN : 0;
  var hD = h2hN ? draws / h2hN : 0;
  var hB = h2hN ? bWins / h2hN : 0;
  var wForm = h2hN ? 0.35 : 0.5, wH2H = h2hN ? 0.30 : 0;
  var sHome = wForm * aForm.wR + wForm * bForm.lR + wH2H * hA;
  var sDraw = wForm * aForm.dR + wForm * bForm.dR + wH2H * hD;
  var sAway = wForm * aForm.lR + wForm * bForm.wR + wH2H * hB;
  var tot = (sHome + sDraw + sAway) || 1;
  return {
    meetings: meetings, aWins: aWins, draws: draws, bWins: bWins,
    totalGoals: totalGoals, h2hN: h2hN,
    aForm: aForm, bForm: bForm,
    hA: hA, hD: hD, hB: hB,
    pHome: sHome / tot * 100, pDraw: sDraw / tot * 100, pAway: sAway / tot * 100
  };
}

/* ---------- language ---------- */

function detectLang() {
  try {
    var saved = window.localStorage.getItem(LS_KEY);
    if (saved === 'fa' || saved === 'ar' || saved === 'en') return saved;
  } catch (e) { /* storage unavailable — fall through */ }
  var nav = (window.navigator && window.navigator.language || '').toLowerCase();
  if (nav.indexOf('ar') === 0) return 'ar';
  if (nav.indexOf('en') === 0) return 'en';
  return 'fa';
}

function setLang(lang, skipSave) {
  state.lang = lang;
  if (!skipSave) {
    try { window.localStorage.setItem(LS_KEY, lang); } catch (e) { /* ignore */ }
  }
  var html = document.documentElement;
  html.lang = lang;
  html.dir = (lang === 'en') ? 'ltr' : 'rtl';
  renderAll();
  positionLangPill();
}

function buildLangToggle() {
  var box = $('lang-toggle');
  var pill = $('lang-pill');
  box.innerHTML = '';
  box.appendChild(pill);
  var langs = ['fa', 'ar', 'en'];
  var labels = { fa: t('header.langFa'), ar: t('header.langAr'), en: t('header.langEn') };
  langs.forEach(function (l) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = labels[l];
    btn.setAttribute('data-lang', l);
    btn.setAttribute('aria-pressed', l === state.lang ? 'true' : 'false');
    btn.setAttribute('aria-label', t('header.langLabel') + ': ' + labels[l]);
    btn.addEventListener('click', function () {
      if (state.lang !== l) setLang(l);
    });
    box.appendChild(btn);
  });
  box.setAttribute('aria-label', t('header.langLabel'));
  requestAnimationFrame(positionLangPill);
}

/* sliding indicator pill — glides to the active language */
function positionLangPill() {
  var box = $('lang-toggle');
  var pill = $('lang-pill');
  if (!box || !pill) return;
  var active = box.querySelector('button[aria-pressed="true"]');
  if (!active) return;
  var bw = box.clientWidth || box.offsetWidth;
  pill.style.width = active.offsetWidth + 'px';
  if (document.documentElement.dir === 'rtl') {
    /* inset-inline-start anchors at the right edge in RTL */
    pill.style.transform = 'translateX(' + (active.offsetLeft + active.offsetWidth - bw + 4) + 'px)';
  } else {
    pill.style.transform = 'translateX(' + (active.offsetLeft - 4) + 'px)';
  }
}

/* ---------- header / hero ---------- */

function oldestFresh() {
  var min = null;
  for (var i = 0; i < DATA.comps.length; i++) {
    var f = DATA.comps[i].fresh;
    if (f && (min === null || f < min)) min = f;
  }
  return min || '';
}

function renderHeader() {
  $('brand-tagline').textContent = t('brand.tagline');
  $('data-badge').innerHTML = t('header.dataBadge', {
    date: '<bdi>' + esc(fmtDate(oldestFresh())) + '</bdi>',
    season: '<bdi>' + esc(t('meta.season')) + '</bdi>'
  });
  buildLangToggle();
}

function renderHero() {
  $('hero-h').textContent = t('hero.title');
  $('hero-sub').textContent = t('hero.sub');
  $('cta-compare').textContent = t('hero.ctaCompare');
  $('cta-fixtures').textContent = t('hero.ctaFixtures');
  $('hero-fast').textContent = t('hero.fastLine');
  document.title = 'Hala — ' + t('hero.title');
}

/* ---------- competition tabs (shared by fixtures + standings) ---------- */

function compTabHTML() {
  return DATA.comps.map(function (c) {
    return '<button role="tab" type="button" data-comp="' + c.id + '" aria-selected="' +
      (c.id === state.comp) + '">' + esc(t('competition.' + c.id)) + '</button>';
  }).join('');
}

function wireCompTabs(el) {
  var btns = el.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-comp');
        if (id !== state.comp) {
          state.comp = id;
          state.trendSel = [];
          renderCompTabs();
          renderFixtures();
          renderStandings();
          renderCharts();
        }
      });
    })(btns[i]);
  }
}

function renderCompTabs() {
  var ft = $('fixture-tabs'), lt = $('league-tabs');
  ft.innerHTML = compTabHTML();
  lt.innerHTML = compTabHTML();
  wireCompTabs(ft);
  wireCompTabs(lt);
  ft.setAttribute('aria-label', t('fixtures.title'));
  lt.setAttribute('aria-label', t('standings.title'));
}

/* ---------- team comparison ---------- */

function pickerOptionsHTML() {
  return DATA.comps.map(function (c) {
    var opts = c.teams.map(function (tm) {
      return '<option value="' + c.id + ':' + tm[0] + '">' + esc(tm[1]) + '</option>';
    }).join('');
    return '<optgroup label="' + esc(t('competition.' + c.id)) + '">' + opts + '</optgroup>';
  }).join('');
}

function parsePicker(val) {
  if (!val) return null;
  var parts = val.split(':');
  var comp = compById(parts[0]);
  var tid = parseInt(parts[1], 10);
  if (!teamOf(comp, tid)) return null;
  return { comp: comp, tid: tid };
}

function crestHTML(comp, tid, small) {
  return '<span class="crest" aria-hidden="true"><bdi>' + esc(teamTla(comp, tid)) + '</bdi></span>';
}

function renderCompare() {
  $('compare-h').textContent = t('compare.title');
  $('compare-sub').textContent = t('compare.sub');
  $('label-cmp-a').textContent = t('compare.selectA');
  $('label-cmp-b').textContent = t('compare.selectB');
  $('cmp-vs').textContent = t('compare.vs');

  var A = parsePicker(state.cmpA), B = parsePicker(state.cmpB);
  var err = $('cmp-error'), panels = $('cmp-panels'), recent = $('cmp-recent'), hint = $('cmp-empty');

  if (!A || !B) {
    hint.hidden = false;
    hint.textContent = t('compare.empty');
    err.hidden = true; panels.hidden = true; recent.hidden = true;
    $('cmp-chipkey').innerHTML = '';
    return;
  }
  if (A.comp.id === B.comp.id && A.tid === B.tid) {
    hint.hidden = true;
    err.hidden = false;
    err.textContent = t('compare.sameTeam');
    panels.hidden = true; recent.hidden = true;
    $('cmp-chipkey').innerHTML = '';
    return;
  }
  hint.hidden = true; err.hidden = true;
  panels.innerHTML = comparePanelRender(A, B) + comparePanelRender(B, A);
  panels.hidden = false;
  $('cmp-chipkey').innerHTML = chipKeyHTML();
  recent.innerHTML = '<h4>' + esc(t('compare.recentTitle')) + '</h4>' +
    '<div class="recent-cols">' + recentTeamHTML(A) + recentTeamHTML(B) + '</div>';
  recent.hidden = false;
}

/* stat rows for one team: [key, label, value, better('hi'|'lo'|null)] */
function cmpStatRows(P) {
  var comp = P.comp, tid = P.tid;
  var row = rowOf(comp, tid);
  return [
    ['position', t('compare.stat.position'), row ? row[0] : null, 'lo'],
    ['played', t('compare.stat.played'), row ? row[2] : null, null],
    ['won', t('compare.stat.won'), row ? row[3] : null, 'hi'],
    ['drawn', t('compare.stat.drawn'), row ? row[4] : null, null],
    ['lost', t('compare.stat.lost'), row ? row[5] : null, 'lo'],
    ['gf', t('compare.stat.gf'), row ? row[6] : null, 'hi'],
    ['ga', t('compare.stat.ga'), row ? row[7] : null, 'lo'],
    ['gd', t('compare.stat.gd'), row ? row[8] : null, 'hi'],
    ['points', t('compare.stat.points'), row ? row[9] : null, 'hi']
  ];
}

function comparePanelRender(P, other) {
  var comp = P.comp, tid = P.tid;
  var rows = cmpStatRows(P), oRows = cmpStatRows(other);
  var lis = rows.map(function (r, i) {
    var label = r[1], v = r[2], better = r[3];
    var ov = oRows[i][2];
    var leads = '';
    if (better && typeof v === 'number' && typeof ov === 'number' && v !== ov) {
      var isLead = better === 'hi' ? v > ov : v < ov;
      if (isLead) leads = ' class="leads" title="' + esc(t('compare.leads')) + '"';
    }
    var vHtml;
    if (typeof v !== 'number') {
      vHtml = '<bdi>—</bdi>';
    } else if (r[0] === 'gd' && v > 0) {
      vHtml = '<bdi>+' + esc(fmtN(v)) + '</bdi>';
    } else {
      vHtml = '<bdi>' + esc(fmtN(v)) + '</bdi>';
    }
    return '<li' + leads + '><span class="k">' + esc(label) + '</span><span class="v">' + vHtml + '</span></li>';
  }).join('');
  var chips = teamMatches(comp, tid).length
    ? formChipsHTML(comp, tid, 5)
    : '<span class="quiet">' + esc(t('compare.formEmpty')) + '</span>';
  lis += '<li><span class="k">' + esc(t('compare.stat.form')) + '</span><span class="v">' + chips + '</span></li>';

  /* UCL strip — matched by numeric team.id */
  var cl = compById('CL');
  var clRow = rowOf(cl, tid);
  var uclHtml;
  if (clRow) {
    var uclChips = teamMatches(cl, tid).length
      ? formChipsHTML(cl, tid, 5)
      : '<span class="quiet">' + esc(t('compare.formEmpty')) + '</span>';
    uclHtml = '<div class="ucl-mini"><span><bdi>#' + esc(fmtN(clRow[0])) + '</bdi></span>' +
      '<span>' + esc(fmtN(clRow[9])) + ' ' + esc(t('compare.stat.points')).toLowerCase() + '</span>' +
      uclChips + '</div>';
  } else {
    uclHtml = '<p class="quiet">' + esc(t('compare.uclEmpty')) + '</p>';
  }

  return '<article class="card cmp-panel">' +
    '<div class="cmp-head">' + crestHTML(comp, tid) +
    '<h3>' + bdi(teamName(comp, tid)) +
    '<span class="comp-name">' + esc(t('competition.' + comp.id)) + '</span></h3></div>' +
    '<ul class="stat-rows">' + lis + '</ul>' +
    '<div class="ucl-strip"><h4>' + esc(t('compare.uclTitle')) + '</h4>' + uclHtml + '</div>' +
    '</article>';
}

function renderComparePanels() { renderCompare(); }

function recentTeamHTML(P) {
  var ms = teamMatches(P.comp, P.tid).slice(-3).reverse();
  var items = ms.length ? ms.map(function (m) {
    return '<li>' + chipTitle(P.comp, m) + '</li>';
  }).join('') : '<li>' + esc(t('compare.formEmpty')) + '</li>';
  return '<div class="recent-team"><h5>' + bdi(teamName(P.comp, P.tid)) + '</h5><ul>' + items + '</ul></div>';
}

/* ---------- fixtures ---------- */

function renderFixtures() {
  $('fixtures-h').textContent = t('fixtures.title');
  $('fixtures-sub').textContent = t('fixtures.sub');
  var comp = compById(state.comp);
  var list = $('fixtures-list');
  var fx = upcomingFixtures(comp, 6);
  var empty = $('fixtures-empty');
  if (!fx.length) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.textContent = t('fixtures.noFixtures');
    return;
  }
  empty.hidden = true;
  list.innerHTML = fx.map(function (m) {
    return '<li><span class="fixture-teams">' + bdi(teamName(comp, m[0])) +
      '<span class="vs">' + esc(t('compare.vs')) + '</span>' + bdi(teamName(comp, m[1])) + '</span>' +
      '<span class="fixture-meta"><span class="md-chip">' +
      t('fixtures.matchday', { n: '<bdi>' + esc(fmtN(m[2])) + '</bdi>' }) +
      '</span><bdi>' + esc(fmtDT(m[6])) + '</bdi></span></li>';
  }).join('');
}

/* ---------- standings ---------- */

function zoneClass(comp, pos, n) {
  if (comp.id === 'CL') {
    if (pos <= 8) return 'z-top8';
    if (pos <= 24) return 'z-playoff';
    return 'z-out';
  }
  if (pos <= 4) return 'z-top4';
  if (pos > n - 3) return 'z-rel';
  return '';
}

function renderStandings() {
  var comp = compById(state.comp);
  $('standings-h').textContent = t('standings.title');

  var ths = ['pos', 'team', 'played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'pts'];
  var head = ths.map(function (k) {
    return '<th scope="col">' + esc(t('standings.th.' + k)) + '</th>';
  }).join('');
  head += '<th scope="col">' + esc(t('standings.th.form')) +
    ' <span style="font-weight:400;letter-spacing:0;text-transform:none">(' + esc(t('standings.formNote')) + ')</span></th>';
  $('standings-head').innerHTML = head;

  var n = comp.table.length;
  $('standings-body').innerHTML = comp.table.map(function (r) {
    var tid = r[1], pos = r[0];
    var gd = (r[8] > 0 ? '+' : '') + r[8];
    return '<tr class="' + zoneClass(comp, pos, n) + '">' +
      '<td><span class="pos"><bdi>' + esc(fmtN(pos)) + '</bdi></span></td>' +
      '<td><span class="team-cell">' + crestHTML(comp, tid, true) + bdi(teamName(comp, tid)) + '</span></td>' +
      '<td><bdi>' + esc(fmtN(r[2])) + '</bdi></td>' +
      '<td><bdi>' + esc(fmtN(r[3])) + '</bdi></td>' +
      '<td><bdi>' + esc(fmtN(r[4])) + '</bdi></td>' +
      '<td><bdi>' + esc(fmtN(r[5])) + '</bdi></td>' +
      '<td><bdi>' + esc(fmtN(r[6])) + '</bdi></td>' +
      '<td><bdi>' + esc(fmtN(r[7])) + '</bdi></td>' +
      '<td><bdi>' + esc(fmtN(gd)) + '</bdi></td>' +
      '<td><strong><bdi>' + esc(fmtN(r[9])) + '</bdi></strong></td>' +
      '<td>' + formChipsHTML(comp, tid, 5) + '</td></tr>';
  }).join('');

  /* legend per competition type */
  var lg = $('standings-legend');
  if (comp.id === 'CL') {
    lg.innerHTML =
      '<span><span class="swatch" style="background:var(--top4);border:1px solid var(--border)"></span>' + esc(t('ucl.legendTop8')) + '</span>' +
      '<span><span class="swatch" style="background:var(--playoff);border:1px solid var(--border)"></span>' + esc(t('ucl.legendPlayoff')) + '</span>' +
      '<span><span class="swatch" style="background:var(--releg);border:1px solid var(--border)"></span>' + esc(t('ucl.legendOut')) + '</span>' +
      '<span>' + esc(t('competition.leaguePhase')) + '</span>' +
      ' <span class="legend-sep">·</span> ' + chipKeyHTML();
  } else {
    lg.innerHTML =
      '<span><span class="swatch" style="background:var(--top4);border:1px solid var(--border)"></span>' + esc(t('standings.legendTop4')) + '</span>' +
      '<span><span class="swatch" style="background:var(--releg);border:1px solid var(--border)"></span>' + esc(t('standings.legendRelegation')) + '</span>' +
      ' <span class="legend-sep">·</span> ' + chipKeyHTML();
  }

  $('standings-note').textContent = t('standings.note');
  var freshKey = comp.id === 'CL' ? 'ucl.freshNote' : 'standings.freshNote';
  $('standings-fresh').innerHTML = t(freshKey, {
    competition: esc(t('competition.' + comp.id)),
    date: '<bdi>' + esc(fmtDate(comp.fresh)) + '</bdi>'
  });
}

/* ---------- head-to-head ---------- */

function renderH2H() {
  $('h2h-h').textContent = t('h2h.title');
  $('pro-badge').textContent = t('pro.badge');
  $('pro-title').textContent = t('pro.title');
  $('pro-note').textContent = t('pro.note');
  $('h2h-sub').textContent = t('h2h.sub');
  $('label-h2h-a').innerHTML = esc(t('h2h.teamA')) + ' <span class="sub-note">' + esc(t('h2h.homeNote')) + '</span>';
  $('label-h2h-b').textContent = t('h2h.teamB');

  var A = parsePicker(state.h2hA), B = parsePicker(state.h2hB);
  var err = $('h2h-error'), res = $('h2h-result');

  if (!A || !B) {
    err.hidden = false; err.textContent = t('h2h.pickTwo');
    res.hidden = true;
    return;
  }
  if (A.comp.id === B.comp.id && A.tid === B.tid) {
    err.hidden = false; err.textContent = t('h2h.sameTeam');
    res.hidden = true;
    return;
  }
  if (A.comp.id !== B.comp.id) {
    err.hidden = false;
    err.innerHTML = t('h2h.sameLeague', {
      a: bdi(teamName(A.comp, A.tid)),
      leagueA: esc(t('competition.' + A.comp.id)),
      b: bdi(teamName(B.comp, B.tid)),
      leagueB: esc(t('competition.' + B.comp.id))
    });
    res.hidden = true;
    return;
  }
  err.hidden = true;

  var comp = A.comp;
  var P = predict(comp, A.tid, B.tid);
  var nameA = teamName(comp, A.tid), nameB = teamName(comp, B.tid);

  /* past meetings */
  $('h2h-meetings-h').innerHTML = esc(t('h2h.pastMeetings')) +
    ' <span class="sub">· ' + esc(t('competition.' + comp.id)) + '</span>';
  $('h2h-meetings').innerHTML = P.meetings.length ? P.meetings.map(function (m) {
    return '<li><span>' + bdi(teamName(comp, m[0])) + ' <strong><bdi>' +
      esc(fmtN(m[4])) + '–' + esc(fmtN(m[5])) + '</bdi></strong> ' + bdi(teamName(comp, m[1])) +
      '</span><span class="date"><bdi>' + esc(fmtDate(m[6])) + '</bdi></span></li>';
  }).join('') : '<li>' + esc(t('h2h.noMeetings')) + '</li>';

  $('h2h-stats').innerHTML =
    '<dt>' + esc(t('h2h.totalGoals')) + '</dt><dd><bdi>' + esc(fmtN(P.totalGoals)) + '</bdi></dd>' +
    '<dt>' + t('h2h.aWins', { a: bdi(nameA) }) + '</dt><dd><bdi>' + esc(fmtN(P.aWins)) + '</bdi></dd>' +
    '<dt>' + esc(t('h2h.draws')) + '</dt><dd><bdi>' + esc(fmtN(P.draws)) + '</bdi></dd>' +
    '<dt>' + t('h2h.bWins', { b: bdi(nameB) }) + '</dt><dd><bdi>' + esc(fmtN(P.bWins)) + '</bdi></dd>';

  /* recent form */
  $('h2h-form-h').textContent = t('h2h.recentForm');
  $('form-a-name').innerHTML = bdi(nameA);
  $('form-b-name').innerHTML = bdi(nameB);
  $('form-a').innerHTML = P.aForm.n ? formChipsHTML(comp, A.tid, 5).replace(/^<span class="form-chips">|<\/span>$/g, '')
    : '<span class="quiet">' + esc(t('compare.formEmpty')) + '</span>';
  $('form-b').innerHTML = P.bForm.n ? formChipsHTML(comp, B.tid, 5).replace(/^<span class="form-chips">|<\/span>$/g, '')
    : '<span class="quiet">' + esc(t('compare.formEmpty')) + '</span>';

  /* prediction bars */
  $('h2h-pred-h').textContent = t('h2h.prediction');
  function bar(cls, label, pctVal) {
    var pct = Math.round(pctVal * 10) / 10;
    return '<div class="pred-bar"><div class="label"><span>' + label +
      '</span><strong><bdi>' + esc(pctStr(pct)) + '</bdi></strong></div>' +
      '<div class="track"><div class="fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div></div>';
  }
  $('pred-bars').innerHTML =
    bar('home', t('h2h.predHomeWin', { a: bdi(nameA) }), P.pHome) +
    bar('draw', esc(t('h2h.predDraw')), P.pDraw) +
    bar('away', t('h2h.predAwayWin', { b: bdi(nameB) }), P.pAway);

  renderMethod(comp, nameA, nameB, P);
  res.hidden = false;
}

function renderMethod(comp, nameA, nameB, P) {
  var det = $('method-details');
  var wasOpen = det.open;

  function pct(x) { return pctStr(x * 100); }
  function wdl(x) { return fmtN(x.w) + '/' + fmtN(x.d) + '/' + fmtN(x.l); }
  var rows =
    '<tr><td>' + t('method.rowFormA', { a: bdi(nameA), n: '<bdi>' + esc(fmtN(P.aForm.n)) + '</bdi>' }) + '</td>' +
    '<td class="num"><bdi>' + esc(wdl(P.aForm)) + '</bdi> → <bdi>' + esc(pct(P.aForm.wR)) + ' / ' + esc(pct(P.aForm.dR)) + ' / ' + esc(pct(P.aForm.lR)) + '</bdi></td>' +
    '<td class="num">—</td><td class="num">—</td></tr>' +
    '<tr><td>' + t('method.rowFormB', { b: bdi(nameB), n: '<bdi>' + esc(fmtN(P.bForm.n)) + '</bdi>' }) + '</td>' +
    '<td class="num">—</td><td class="num">—</td>' +
    '<td class="num"><bdi>' + esc(wdl(P.bForm)) + '</bdi> → <bdi>' + esc(pct(P.bForm.wR)) + ' / ' + esc(pct(P.bForm.dR)) + ' / ' + esc(pct(P.bForm.lR)) + '</bdi></td></tr>' +
    '<tr><td>' + t('method.rowH2H', { n: '<bdi>' + esc(fmtN(P.h2hN)) + '</bdi>' }) + '</td>' +
    '<td class="num"><bdi>' + esc(fmtN(P.aWins)) + '</bdi> → <bdi>' + esc(pct(P.hA)) + '</bdi></td>' +
    '<td class="num"><bdi>' + esc(fmtN(P.draws)) + '</bdi> → <bdi>' + esc(pct(P.hD)) + '</bdi></td>' +
    '<td class="num"><bdi>' + esc(fmtN(P.bWins)) + '</bdi> → <bdi>' + esc(pct(P.hB)) + '</bdi></td></tr>' +
    '<tr><td><strong>' + esc(t('method.rowResult')) + '</strong></td>' +
    '<td class="num"><strong><bdi>' + esc(pctStr(P.pHome)) + '</bdi></strong></td>' +
    '<td class="num"><strong><bdi>' + esc(pctStr(P.pDraw)) + '</bdi></strong></td>' +
    '<td class="num"><strong><bdi>' + esc(pctStr(P.pAway)) + '</bdi></strong></td></tr>';

  $('method-body').innerHTML =
    '<h4>' + esc(t('method.title')) + '</h4>' +
    '<ol><li>' + t('method.step1') + '</li><li>' + t('method.step2') + '</li>' +
    '<li>' + t('method.step3') + '</li><li>' + t('method.step4') + '</li></ol>' +
    '<p><code dir="ltr">' + esc(t('method.formula')) + '</code></p>' +
    '<table><thead><tr><th scope="col">' + esc(t('method.thInput')) + '</th>' +
    '<th scope="col" class="num">' + esc(t('method.thHome')) + '</th>' +
    '<th scope="col" class="num">' + esc(t('method.thDraw')) + '</th>' +
    '<th scope="col" class="num">' + esc(t('method.thAway')) + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<p>' + esc(t('method.weights')) + '</p>' +
    '<p class="disclaimer">' + esc(t('method.disclaimer')) + '</p>';
  det.open = wasOpen;
  var summary = $('method-summary');
  summary.textContent = det.open ? t('method.hide') : t('method.show');
  if (!det.dataset.wired) {
    det.dataset.wired = '1';
    det.addEventListener('toggle', function () {
      summary.textContent = det.open ? t('method.hide') : t('method.show');
    });
  }
}

/* ---------- charts ---------- */

function svgEl(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function svgText(x, y, str, attrs) {
  var t = svgEl('text', attrs || {});
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.textContent = str;
  return t;
}

function renderTrendChart() {
  var comp = compById(state.comp);
  $('trend-h').textContent = t('charts.trendTitle');
  $('trend-note').textContent = t('charts.trendNote');

  var valid = comp.teams.map(function (tm) { return tm[0]; });
  state.trendSel = state.trendSel.filter(function (id) { return valid.indexOf(id) >= 0; });
  if (!state.trendSel.length) {
    state.trendSel = comp.table.slice(0, 5).map(function (r) { return r[1]; });
  }

  /* toggles */
  var box = $('trend-toggles');
  box.innerHTML = '';
  comp.table.forEach(function (r) {
    var tid = r[1];
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'team-toggle';
    btn.setAttribute('aria-pressed', state.trendSel.indexOf(tid) >= 0 ? 'true' : 'false');
    var idx = state.trendSel.indexOf(tid);
    if (idx >= 0) btn.style.setProperty('--toggle-color', LINE_COLORS[idx % LINE_COLORS.length]);
    btn.title = idx >= 0 ? '' : (state.trendSel.length >= 5 ? t('charts.maxTeams') : '');
    var dot = document.createElement('span');
    dot.className = 'dot';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(teamName(comp, tid)));
    btn.addEventListener('click', function () {
      var i = state.trendSel.indexOf(tid);
      if (i >= 0) state.trendSel.splice(i, 1);
      else if (state.trendSel.length < 5) state.trendSel.push(tid);
      renderTrendChart();
    });
    box.appendChild(btn);
  });

  /* series: cumulative points per matchday (FINISHED only) */
  var maxMD = 0;
  for (var i = 0; i < comp.m.length; i++) {
    if (comp.m[i][3] === 0 && comp.m[i][2] > maxMD) maxMD = comp.m[i][2];
  }
  var series = state.trendSel.map(function (tid) {
    var ms = teamMatches(comp, tid);
    var byMD = {};
    ms.forEach(function (m) {
      var p = pointsFor(resultFor(m, tid));
      byMD[m[2]] = (byMD[m[2]] || 0) + p;
    });
    var cum = 0, arr = [];
    for (var md = 1; md <= maxMD; md++) {
      cum += byMD[md] || 0;
      arr.push(cum);
    }
    return { tid: tid, name: teamName(comp, tid), data: arr };
  });

  var wrap = $('trend-chart');
  if (series.length < 2 || maxMD < 1) {
    wrap.innerHTML = '<p class="chart-note">' + esc(t('charts.trendNote')) + '</p>';
    $('trend-legend').innerHTML = '';
    return;
  }

  var maxPts = 0;
  series.forEach(function (s) { s.data.forEach(function (p) { if (p > maxPts) maxPts = p; }); });
  maxPts = Math.max(10, Math.ceil(maxPts / 10) * 10);

  var W = 920, H = 360, P = { l: 52, r: 12, t: 14, b: 34 };
  var iw = W - P.l - P.r, ih = H - P.t - P.b;
  var svg = svgEl('svg', { 'class': 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
  svg.setAttribute('aria-label', t('charts.trendTitle'));
  function gx(md) { return P.l + (md - 1) / Math.max(1, maxMD - 1) * iw; }
  function gy(p) { return P.t + ih - p / maxPts * ih; }

  var grid = svgEl('g', { 'class': 'grid' });
  var yStep = maxPts <= 40 ? 10 : 20;
  for (var yv = 0; yv <= maxPts; yv += yStep) {
    grid.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: gy(yv), y2: gy(yv) }));
    grid.appendChild(svgText(P.l - 8, gy(yv) + 4, fmtN(yv), { 'text-anchor': 'end', 'font-size': 11 }));
  }
  svg.appendChild(grid);
  var mdStep = maxMD > 30 ? 4 : (maxMD > 12 ? 2 : 1);
  for (var md = 1; md <= maxMD; md += mdStep) {
    svg.appendChild(svgText(gx(md), H - 12,
      t('charts.trendAxisX') + ' ' + fmtN(md), { 'text-anchor': 'middle', 'font-size': 10 }));
  }
  svg.appendChild(svgEl('line', { x1: P.l, x2: P.l, y1: P.t, y2: H - P.b, 'class': 'axis' }));
  svg.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b, 'class': 'axis' }));
  svg.appendChild(svgText(P.l - 8, P.t + 4, t('charts.trendAxisY'), { 'text-anchor': 'end', 'font-size': 10 }));

  series.forEach(function (s, si) {
    var d = s.data.map(function (p, k) {
      return (k === 0 ? 'M' : 'L') + gx(k + 1).toFixed(1) + ',' + gy(p).toFixed(1);
    }).join(' ');
    svg.appendChild(svgEl('path', {
      d: d, fill: 'none', stroke: LINE_COLORS[si % LINE_COLORS.length], 'stroke-width': 2.2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
    var last = s.data[s.data.length - 1];
    svg.appendChild(svgText(gx(maxMD) + 6, gy(last) + 4,
      s.name + ' · ' + fmtN(last), { 'font-size': 11, fill: LINE_COLORS[si % LINE_COLORS.length] }));
  });

  wrap.innerHTML = '';
  wrap.appendChild(svg);
  $('trend-legend').innerHTML = series.map(function (s, si) {
    return '<span><span class="key" style="background:' + LINE_COLORS[si % LINE_COLORS.length] +
      '"></span>' + esc(s.name) + '</span>';
  }).join('');
}

function renderGfGaChart() {
  var comp = compById(state.comp);
  $('gfga-h').textContent = t('charts.gfgaTitle');
  $('gfga-note').textContent = t('charts.gfgaNote');
  var rows = comp.table.slice().sort(function (a, b) { return b[6] - a[6]; });
  var maxG = 0;
  rows.forEach(function (r) { maxG = Math.max(maxG, r[6], r[7]); });
  maxG = Math.max(10, Math.ceil(maxG / 10) * 10);

  var rowH = 30, labelW = 190, W = 920, Pt = 8, Pb = 30;
  var H = rows.length * rowH + Pt + Pb;
  var bw = W - labelW - 30;
  var svg = svgEl('svg', { 'class': 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
  svg.setAttribute('aria-label', t('charts.gfgaTitle'));
  function bx(g) { return labelW + g / maxG * bw; }

  for (var gv = 0; gv <= maxG; gv += 20) {
    svg.appendChild(svgEl('line', { x1: bx(gv), x2: bx(gv), y1: Pt, y2: H - Pb, stroke: '#dde5e1', 'stroke-width': 1 }));
    svg.appendChild(svgText(bx(gv), H - 10, fmtN(gv), { 'text-anchor': 'middle', 'font-size': 10 }));
  }

  rows.forEach(function (r, i) {
    var y = Pt + i * rowH;
    var tid = r[1];
    svg.appendChild(svgText(labelW - 8, y + 13, teamName(comp, tid), { 'text-anchor': 'end', 'font-size': 11 }));
    svg.appendChild(svgEl('rect', { x: labelW, y: y + 2, width: Math.max(1, r[6] / maxG * bw), height: 9, fill: '#1e9e5a', rx: 2 }));
    svg.appendChild(svgEl('rect', { x: labelW, y: y + 14, width: Math.max(1, r[7] / maxG * bw), height: 9, fill: '#d64541', rx: 2 }));
    svg.appendChild(svgText(bx(r[6]) + 5, y + 10, fmtN(r[6]), { 'font-size': 10 }));
    svg.appendChild(svgText(bx(r[7]) + 5, y + 22, fmtN(r[7]), { 'font-size': 10 }));
  });

  var wrap = $('gfga-chart');
  wrap.innerHTML = '';
  wrap.appendChild(svg);
  $('gfga-legend').innerHTML =
    '<span><span class="key" style="background:var(--bar-gf)"></span>' + esc(t('charts.goalsFor')) + '</span>' +
    '<span><span class="key" style="background:var(--bar-ga)"></span>' + esc(t('charts.goalsAgainst')) + '</span>';
}

function renderCharts() {
  renderTrendChart();
  renderGfGaChart();
}

/* ---------- footer ---------- */

function renderFooter() {
  $('footer-text').textContent = t('footer.text');
  $('footer-data').textContent = t('footer.data');
  /* freshness derived from the data bundle itself (never hardcoded):
     leagues = newest league snapshot, UCL = its own older snapshot */
  var freshL = '', freshU = '';
  for (var i = 0; i < DATA.comps.length; i++) {
    var c = DATA.comps[i];
    if (!c.fresh) continue;
    if (c.id === 'CL') { freshU = c.fresh; }
    else if (c.fresh > freshL) { freshL = c.fresh; }
  }
  $('footer-fresh').innerHTML =
    t('footer.freshLeagues', { date: '<bdi>' + esc(fmtDate(freshL)) + '</bdi>' }) +
    ' · ' + t('footer.freshUcl', { date: '<bdi>' + esc(fmtDate(freshU)) + '</bdi>' });
}

/* ---------- init ---------- */

function fatal() {
  var msg = 'Hala: data bundle failed to load.';
  var retry = '↻';
  try {
    if (I18N && (I18N.fa || I18N.en)) {
      msg = t('state.error');
      retry = t('state.retry');
    }
  } catch (e) { /* keep the hardcoded fallback */ }
  document.body.innerHTML = '<p style="padding:2rem;color:#ff8f8f">' + esc(msg) +
    ' <button type="button" onclick="location.reload()">' + esc(retry) + '</button></p>';
}

function fillPickers() {
  var html = '<option value="">' + esc(t('compare.pickPlaceholder')) + '</option>' + pickerOptionsHTML();
  var ca = $('cmp-a'), cb = $('cmp-b'), ha = $('h2h-a'), hb = $('h2h-b');
  ca.innerHTML = html; cb.innerHTML = html;
  ha.innerHTML = pickerOptionsHTML(); hb.innerHTML = pickerOptionsHTML();
  if (state.cmpA) ca.value = state.cmpA;
  if (state.cmpB) cb.value = state.cmpB;
  if (state.h2hA) ha.value = state.h2hA;
  if (state.h2hB) hb.value = state.h2hB;
}

function renderAll() {
  fmtCache = {};
  renderHeader();
  renderHero();
  renderCompTabs();
  fillPickers();
  renderComparePanels();
  renderFixtures();
  renderStandings();
  renderH2H();
  renderCharts();
  renderFooter();
}

function init() {
  if (!DATA || !DATA.comps || !I18N || !I18N.fa) {
    fatal();
    return;
  }
  state.lang = detectLang();
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'en' ? 'ltr' : 'rtl';

  renderAll();

  $('cmp-a').addEventListener('change', function (e) { state.cmpA = e.target.value; renderComparePanels(); });
  $('cmp-b').addEventListener('change', function (e) { state.cmpB = e.target.value; renderComparePanels(); });
  $('h2h-a').addEventListener('change', function (e) { state.h2hA = e.target.value; renderH2H(); });
  $('h2h-b').addEventListener('change', function (e) { state.h2hB = e.target.value; renderH2H(); });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { positionLangPill(); });
  }
  window.addEventListener('resize', function () { positionLangPill(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
