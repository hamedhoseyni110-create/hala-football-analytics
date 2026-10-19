/* Hala — app logic. Pure static, no network, no libraries.
   Depends on window.HALA_DATA from data.js. */

'use strict';

var DATA = window.HALA_DATA;
var state = { leagueId: 'eng' };

var LINE_COLORS = ['#0e7a4f', '#c46a00', '#1d5fc2', '#a02aa0', '#6b4f2a'];

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function $(id) { return document.getElementById(id); }

function getLeague(id) {
  for (var i = 0; i < DATA.leagues.length; i++) {
    if (DATA.leagues[i].id === id) return DATA.leagues[i];
  }
  return DATA.leagues[0];
}

function leagueOfTeam(teamId) {
  for (var i = 0; i < DATA.leagues.length; i++) {
    var lg = DATA.leagues[i];
    for (var j = 0; j < lg.teams.length; j++) {
      if (lg.teams[j].id === teamId) return lg;
    }
  }
  return null;
}

function displayOf(lg, full) {
  for (var i = 0; i < lg.teams.length; i++) {
    if (lg.teams[i].full === full) return lg.teams[i].name;
  }
  return full;
}

/* matches for one team, chronological: date, then time-ish order, then round */
function teamMatches(lg, full) {
  var out = [];
  for (var i = 0; i < lg.matches.length; i++) {
    var m = lg.matches[i];
    if (m.home === full || m.away === full) out.push(m);
  }
  out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.round - b.round;
  });
  return out;
}

/* result from the perspective of `full`: 'W' | 'D' | 'L' */
function resultFor(m, full) {
  var gf = m.home === full ? m.hg : m.ag;
  var ga = m.home === full ? m.ag : m.hg;
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}

function pointsFor(r) { return r === 'W' ? 3 : r === 'D' ? 1 : 0; }

/* ---------- standings ---------- */

function computeStandings(lg) {
  var t = {};
  lg.teams.forEach(function (tm) {
    t[tm.full] = { full: tm.full, name: tm.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  });
  lg.matches.forEach(function (m) {
    var h = t[m.home], a = t[m.away];
    if (!h || !a) return;
    h.p++; a.p++;
    h.gf += m.hg; h.ga += m.ag;
    a.gf += m.ag; a.ga += m.hg;
    if (m.hg > m.ag) { h.w++; h.pts += 3; a.l++; }
    else if (m.hg < m.ag) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  });
  var rows = Object.keys(t).map(function (k) { return t[k]; });
  rows.forEach(function (r) { r.gd = r.gf - r.ga; });
  rows.sort(function (x, y) {
    return (y.pts - x.pts) || (y.gd - x.gd) || (y.gf - x.gf) || (x.name < y.name ? -1 : 1);
  });
  return rows;
}

function formChipsHTML(lg, full, n) {
  var ms = teamMatches(lg, full).slice(-n);
  return '<span class="form-chips">' + ms.map(function (m) {
    var r = resultFor(m, full);
    return '<span class="chip ' + r.toLowerCase() + '" title="' +
      esc(displayOf(lg, m.home)) + ' ' + m.hg + '–' + m.ag + ' ' +
      esc(displayOf(lg, m.away)) + ' (' + esc(m.date) + ')">' + r + '</span>';
  }).join('') + '</span>';
}

function renderLeagueTabs() {
  var el = $('league-tabs');
  el.innerHTML = DATA.leagues.map(function (lg) {
    return '<button role="tab" data-league="' + lg.id + '" aria-selected="' +
      (lg.id === state.leagueId) + '">' + esc(lg.name) + '</button>';
  }).join('');
  el.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.leagueId = btn.getAttribute('data-league');
      renderLeagueTabs();
      renderStandings();
      renderCharts();
    });
  });
}

function renderStandings() {
  var lg = getLeague(state.leagueId);
  var rows = computeStandings(lg);
  var n = lg.teams.length;
  var topN = 4, relegN = 3; // simplified zones
  var html = rows.map(function (r, i) {
    var cls = i < topN ? 'pos-top4' : (i >= n - relegN ? 'pos-releg' : '');
    return '<tr class="' + cls + '"><td><span class="pos">' + (i + 1) + '</span></td>' +
      '<td>' + esc(r.name) + '</td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d +
      '</td><td>' + r.l + '</td><td>' + r.gf + '</td><td>' + r.ga + '</td><td>' +
      (r.gd > 0 ? '+' : '') + r.gd + '</td><td><strong>' + r.pts + '</strong></td><td>' +
      formChipsHTML(lg, r.full, 5) + '</td></tr>';
  }).join('');
  $('standings-body').innerHTML = html;
  $('standings-legend').innerHTML =
    '<span><span class="swatch" style="background:var(--top4);border:1px solid var(--border)"></span>Top 4</span>' +
    '<span><span class="swatch" style="background:var(--releg);border:1px solid var(--border)"></span>Relegation zone (bottom 3)</span>' +
    '<span>' + esc(lg.name) + ' · ' + n + ' teams · ' + lg.matches.length + ' matches played</span>';
}

/* ---------- head-to-head ---------- */

function fillTeamPickers() {
  var html = DATA.leagues.map(function (lg) {
    var opts = lg.teams.map(function (tm) {
      return '<option value="' + lg.id + ':' + tm.id + '">' + esc(tm.name) + '</option>';
    }).join('');
    return '<optgroup label="' + esc(lg.name) + '">' + opts + '</optgroup>';
  }).join('');
  $('team-a').innerHTML = html;
  $('team-b').innerHTML = html;
  $('team-a').value = 'eng:liverpool-fc';
  $('team-b').value = 'eng:arsenal-fc';
  if (!$('team-a').value) $('team-a').selectedIndex = 0;
  if (!$('team-b').value) $('team-b').selectedIndex = 1;
}

function parsePicker(val) {
  var parts = val.split(':');
  var lg = getLeague(parts[0]);
  var tm = null;
  for (var i = 0; i < lg.teams.length; i++) {
    if (lg.teams[i].id === parts[1]) tm = lg.teams[i];
  }
  return { lg: lg, team: tm };
}

function wdlRates(ms, full) {
  var w = 0, d = 0, l = 0;
  ms.forEach(function (m) {
    var r = resultFor(m, full);
    if (r === 'W') w++; else if (r === 'D') d++; else l++;
  });
  var n = ms.length || 1;
  return { w: w, d: d, l: l, n: ms.length, wR: w / n, dR: d / n, lR: l / n };
}

function renderH2H() {
  var A = parsePicker($('team-a').value);
  var B = parsePicker($('team-b').value);
  var err = $('h2h-error'), res = $('h2h-result'), formula = $('formula-box');

  if (!A.team || !B.team) { err.hidden = false; err.textContent = 'Please pick two teams.'; res.hidden = true; formula.hidden = true; return; }
  if (A.team.id === B.team.id && A.lg.id === B.lg.id) {
    err.hidden = false; err.textContent = 'Pick two different teams.'; res.hidden = true; formula.hidden = true; return;
  }
  if (A.lg.id !== B.lg.id) {
    err.hidden = false;
    err.textContent = 'Head-to-head needs both teams in the same league (' +
      A.team.name + ' plays in ' + A.lg.name + ', ' + B.team.name + ' plays in ' + B.lg.name + ').';
    res.hidden = true; formula.hidden = true; return;
  }

  err.hidden = true;
  var lg = A.lg, aF = A.team.full, bF = B.team.full;

  /* meetings this season (chronological) */
  var meetings = lg.matches.filter(function (m) {
    return (m.home === aF && m.away === bF) || (m.home === bF && m.away === aF);
  }).sort(function (x, y) { return x.date < y.date ? -1 : 1; });

  $('h2h-league').textContent = '· ' + lg.name + ' 2025/26';
  $('h2h-meetings').innerHTML = meetings.length ? meetings.map(function (m) {
    return '<li><span>' + esc(displayOf(lg, m.home)) + ' <strong>' + m.hg + '–' + m.ag +
      '</strong> ' + esc(displayOf(lg, m.away)) + '</span><span class="date">' + esc(m.date) + '</span></li>';
  }).join('') : '<li>No meetings this season.</li>';

  var totalGoals = 0, aWins = 0, draws = 0, bWins = 0;
  meetings.forEach(function (m) {
    totalGoals += m.hg + m.ag;
    var ra = resultFor(m, aF);
    if (ra === 'W') aWins++; else if (ra === 'D') draws++; else bWins++;
  });
  $('h2h-goals').textContent = totalGoals;
  $('h2h-awins').textContent = aWins + ' (' + A.team.name + ')';
  $('h2h-draws').textContent = draws;
  $('h2h-bwins').textContent = bWins + ' (' + B.team.name + ')';

  /* recent form */
  $('form-a-name').textContent = A.team.name;
  $('form-b-name').textContent = B.team.name;
  $('form-a').innerHTML = formChipsHTML(lg, aF, 5).replace(/^<span class="form-chips">|<\/span>$/g, '');
  $('form-b').innerHTML = formChipsHTML(lg, bF, 5).replace(/^<span class="form-chips">|<\/span>$/g, '');

  /* prediction */
  var aForm = wdlRates(teamMatches(lg, aF).slice(-10), aF);
  var bForm = wdlRates(teamMatches(lg, bF).slice(-10), bF);
  var h2hN = meetings.length;
  var hA = h2hN ? aWins / h2hN : 0, hD = h2hN ? draws / h2hN : 0, hB = h2hN ? bWins / h2hN : 0;

  var wForm = h2hN ? 0.35 : 0.5, wH2H = h2hN ? 0.30 : 0;
  var sHome = wForm * aForm.wR + wForm * bForm.lR + wH2H * hA;
  var sDraw = wForm * aForm.dR + wForm * bForm.dR + wH2H * hD;
  var sAway = wForm * aForm.lR + wForm * bForm.wR + wH2H * hB;
  var tot = (sHome + sDraw + sAway) || 1;
  var pHome = sHome / tot * 100, pDraw = sDraw / tot * 100, pAway = sAway / tot * 100;

  function bar(cls, label, pct) {
    return '<div class="pred-bar"><div class="label"><span>' + esc(label) +
      '</span><strong>' + pct.toFixed(1) + '%</strong></div>' +
      '<div class="track"><div class="fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div></div>';
  }
  $('pred-bars').innerHTML =
    bar('home', A.team.name + ' win', pHome) +
    bar('draw', 'Draw', pDraw) +
    bar('away', B.team.name + ' win', pAway);

  /* explain the inputs */
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  $('formula-inputs').innerHTML =
    '<tr><td>' + esc(A.team.name) + ' — last ' + aForm.n + ' (W/D/L)</td>' +
    '<td class="num">' + aForm.w + '/' + aForm.d + '/' + aForm.l + ' → ' + pct(aForm.wR) + ' / ' + pct(aForm.dR) + ' / ' + pct(aForm.lR) + '</td>' +
    '<td class="num">—</td><td class="num">—</td></tr>' +
    '<tr><td>' + esc(B.team.name) + ' — last ' + bForm.n + ' (W/D/L)</td>' +
    '<td class="num">—</td><td class="num">—</td>' +
    '<td class="num">' + bForm.w + '/' + bForm.d + '/' + bForm.l + ' → ' + pct(bForm.wR) + ' / ' + pct(bForm.dR) + ' / ' + pct(bForm.lR) + '</td></tr>' +
    '<tr><td>Head-to-head — ' + h2hN + ' meeting' + (h2hN === 1 ? '' : 's') + ' (A wins / draws / B wins)</td>' +
    '<td class="num">' + aWins + ' → ' + pct(hA) + '</td>' +
    '<td class="num">' + draws + ' → ' + pct(hD) + '</td>' +
    '<td class="num">' + bWins + ' → ' + pct(hB) + '</td></tr>' +
    '<tr><td><strong>Result</strong></td>' +
    '<td class="num"><strong>' + pHome.toFixed(1) + '%</strong></td>' +
    '<td class="num"><strong>' + pDraw.toFixed(1) + '%</strong></td>' +
    '<td class="num"><strong>' + pAway.toFixed(1) + '%</strong></td></tr>';

  res.hidden = false;
  formula.hidden = false;
}

/* ---------- charts ---------- */

var trendSelection = []; // team full names, max 5

function svgEl(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function svgText(x, y, str, attrs) {
  var t = svgEl('text', Object.assign({ x: x, y: y }, attrs || {}));
  t.textContent = str;
  return t;
}

function renderTrendChart() {
  var lg = getLeague(state.leagueId);
  var standings = computeStandings(lg);

  /* keep selection valid for this league; default = current top 5 */
  var valid = lg.teams.map(function (t) { return t.full; });
  trendSelection = trendSelection.filter(function (f) { return valid.indexOf(f) >= 0; });
  if (!trendSelection.length) {
    trendSelection = standings.slice(0, 5).map(function (r) { return r.full; });
  }

  /* toggles */
  var box = $('trend-toggles');
  box.innerHTML = '';
  standings.forEach(function (r) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'team-toggle';
    btn.textContent = r.name;
    var idx = trendSelection.indexOf(r.full);
    btn.setAttribute('aria-pressed', idx >= 0 ? 'true' : 'false');
    if (idx >= 0) btn.style.setProperty('--toggle-color', LINE_COLORS[idx % LINE_COLORS.length]);
    btn.title = idx >= 0 ? 'Remove from chart' : (trendSelection.length >= 5 ? 'Chart is full (max 5 teams)' : 'Add to chart');
    btn.addEventListener('click', function () {
      var i = trendSelection.indexOf(r.full);
      if (i >= 0) trendSelection.splice(i, 1);
      else if (trendSelection.length < 5) trendSelection.push(r.full);
      renderTrendChart();
    });
    var dot = document.createElement('span');
    dot.className = 'dot';
    btn.insertBefore(dot, btn.firstChild);
    box.appendChild(btn);
  });

  /* series: cumulative points per matchday */
  var maxMD = 0;
  lg.matches.forEach(function (m) { if (m.round > maxMD) maxMD = m.round; });
  var series = trendSelection.map(function (full) {
    var ms = teamMatches(lg, full).sort(function (a, b) { return a.round - b.round || (a.date < b.date ? -1 : 1); });
    var cum = 0, pts = [];
    ms.forEach(function (m) { cum += pointsFor(resultFor(m, full)); pts[m.round] = cum; });
    var arr = [];
    for (var md = 1; md <= maxMD; md++) arr.push(pts[md] != null ? pts[md] : (arr.length ? arr[arr.length - 1] : 0));
    return { full: full, name: displayOf(lg, full), data: arr };
  });
  var maxPts = 0;
  series.forEach(function (s) { s.data.forEach(function (p) { if (p > maxPts) maxPts = p; }); });
  maxPts = Math.ceil(maxPts / 10) * 10;

  var W = 920, H = 360, P = { l: 46, r: 12, t: 14, b: 34 };
  var iw = W - P.l - P.r, ih = H - P.t - P.b;
  var svg = svgEl('svg', { 'class': 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Cumulative points per matchday' });
  var gx = function (md) { return P.l + (md - 1) / (maxMD - 1) * iw; };
  var gy = function (p) { return P.t + ih - p / maxPts * ih; };

  var grid = svgEl('g', { 'class': 'grid' });
  var yStep = maxPts <= 40 ? 10 : 20;
  for (var yv = 0; yv <= maxPts; yv += yStep) {
    grid.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: gy(yv), y2: gy(yv) }));
    svg.appendChild(svgText(P.l - 8, gy(yv) + 4, String(yv), { 'text-anchor': 'end', 'font-size': 11 }));
  }
  svg.appendChild(grid);
  for (var md = 1; md <= maxMD; md += (maxMD > 30 ? 4 : 2)) {
    svg.appendChild(svgText(gx(md), H - 12, 'MD' + md, { 'text-anchor': 'middle', 'font-size': 10 }));
  }
  svg.appendChild(svgEl('line', { x1: P.l, x2: P.l, y1: P.t, y2: H - P.b, 'class': 'axis' }));
  svg.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b, 'class': 'axis' }));

  series.forEach(function (s, i) {
    var d = s.data.map(function (p, k) {
      return (k === 0 ? 'M' : 'L') + gx(k + 1).toFixed(1) + ',' + gy(p).toFixed(1);
    }).join(' ');
    svg.appendChild(svgEl('path', {
      d: d, fill: 'none', stroke: LINE_COLORS[i % LINE_COLORS.length], 'stroke-width': 2.2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
    var last = s.data[s.data.length - 1];
    svg.appendChild(svgText(gx(maxMD) + 6, gy(last) + 4, s.name + ' (' + last + ')', { 'font-size': 11, fill: LINE_COLORS[i % LINE_COLORS.length] }));
  });

  var wrap = $('trend-chart');
  wrap.innerHTML = '';
  wrap.appendChild(svg);
  $('trend-legend').innerHTML = series.map(function (s, i) {
    return '<span><span class="key" style="background:' + LINE_COLORS[i % LINE_COLORS.length] + '"></span>' + esc(s.name) + '</span>';
  }).join('');
}

function renderGfGaChart() {
  var lg = getLeague(state.leagueId);
  var rows = computeStandings(lg).slice().sort(function (a, b) { return b.gf - a.gf; });
  var maxG = 0;
  rows.forEach(function (r) { maxG = Math.max(maxG, r.gf, r.ga); });
  maxG = Math.ceil(maxG / 10) * 10;

  var rowH = 30, labelW = 190, W = 920, P = { t: 8, b: 30 };
  var H = rows.length * rowH + P.t + P.b;
  var bw = W - labelW - 30;
  var svg = svgEl('svg', { 'class': 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Goals for vs goals against' });
  var bx = function (g) { return labelW + g / maxG * bw; };

  for (var gv = 0; gv <= maxG; gv += 20) {
    svg.appendChild(svgEl('line', { x1: bx(gv), x2: bx(gv), y1: P.t, y2: H - P.b, stroke: '#dde5e1', 'stroke-width': 1 }));
    svg.appendChild(svgText(bx(gv), H - 10, String(gv), { 'text-anchor': 'middle', 'font-size': 10 }));
  }

  rows.forEach(function (r, i) {
    var y = P.t + i * rowH;
    svg.appendChild(svgText(labelW - 8, y + 13, r.name, { 'text-anchor': 'end', 'font-size': 11 }));
    svg.appendChild(svgEl('rect', { x: labelW, y: y + 2, width: Math.max(1, r.gf / maxG * bw), height: 9, fill: '#1e9e5a', rx: 2 }));
    svg.appendChild(svgEl('rect', { x: labelW, y: y + 14, width: Math.max(1, r.ga / maxG * bw), height: 9, fill: '#d64541', rx: 2 }));
    svg.appendChild(svgText(bx(r.gf) + 5, y + 10, String(r.gf), { 'font-size': 10 }));
    svg.appendChild(svgText(bx(r.ga) + 5, y + 22, String(r.ga), { 'font-size': 10 }));
  });

  var wrap = $('gfga-chart');
  wrap.innerHTML = '';
  wrap.appendChild(svg);
}

function renderCharts() {
  renderTrendChart();
  renderGfGaChart();
}

/* ---------- init ---------- */

function init() {
  if (!window.HALA_DATA) {
    document.body.innerHTML = '<p style="padding:2rem">Error: data.js failed to load.</p>';
    return;
  }
  $('data-badge').textContent = 'Data as of ' + DATA.asOf + ' · 2025/26 complete season';
  renderLeagueTabs();
  renderStandings();
  fillTeamPickers();
  renderH2H();
  renderCharts();
  $('team-a').addEventListener('change', renderH2H);
  $('team-b').addEventListener('change', renderH2H);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
