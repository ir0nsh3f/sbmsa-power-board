(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./ratings.js') : root.SBMSARatings);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SBMSASchedules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';
  const favorites = [
    {sport:'flag', division:'Burrow', team:'Buccaneers', child:'Dexter'},
    {sport:'8u', division:'Pulisic', team:'Arsenal', child:'Beckham'},
    {sport:'6u', division:'Messi', team:'Vipers', child:'Dexter'}
  ];
  function chicagoDate(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(value);
    const get = name => parts.find(p => p.type === name).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function buildRows(data, today = new Date()) {
    today = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : chicagoDate(new Date(today));
    const ranks = new Map();
    for (const sport of new Set((data?.divisions || []).map(d => d.sport))) {
      R.compute(data.divisions || [], sport, data.ratingMode || 'raw').filter(t=>t.rank).forEach(t=>ranks.set(JSON.stringify([sport,t.division,t.team]),t.rankText));
    }
    const rows = [];
    for (const division of data?.divisions || []) {
      const favorite = favorites.find(f => f.sport === division.sport && f.division === division.division);
      if (!favorite) continue;
      for (const game of division.schedule || []) {
        if (game.home !== favorite.team && game.away !== favorite.team) continue;
        const opponent = game.home === favorite.team ? game.away : game.home;
        const team = (division.teams || []).find(t => t.team === opponent);
        const venue = game.home === favorite.team ? 'Home' : 'Away';
        const scoreFor = venue === 'Home' ? game.home_score : game.away_score;
        const scoreAgainst = venue === 'Home' ? game.away_score : game.home_score;
        const completed = [scoreFor, scoreAgainst].every(s => Number.isInteger(s) && s >= 0);
        const start = typeof game.start_iso === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(game.start_iso) ? Date.parse(game.start_iso) : NaN;
        const dateISO = Number.isFinite(start) ? chicagoDate(new Date(start)) : /^\d{4}-\d{2}-\d{2}$/.test(game.date_iso || '') ? game.date_iso : null;
        const timeLabel = Number.isFinite(start) ? new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(start)) + ' CT' : game.time ? game.time + ' CT' : 'Time TBD';
        // Within each CT calendar day, date-only entries precede timed entries.
        // UTC instants preserve chronology through the repeated fall DST hour.
        const sortTime = Number.isFinite(start) ? new Date(start).toISOString() : '';
        const status = completed ? (scoreFor > scoreAgainst ? 'W' : scoreFor < scoreAgainst ? 'L' : 'T')
          : dateISO && dateISO < today ? 'Awaiting result' : !dateISO ? 'Time TBD' : 'Upcoming';
        const average = value => Number.isFinite(value) && Number.isFinite(team?.gp) && team.gp > 0 ? value / team.gp : null;
        const record = team && ['w','l','t'].every(k => Number.isInteger(team[k]) && team[k] >= 0) ? `${team.w}–${team.l}–${team.t}` : null;
        rows.push({...favorite, opponent, opponentCoach:team?.coach || null, sourceUrl:division.url,
          ourCoach:(division.teams || []).find(t => t.team === favorite.team)?.coach || null,
          opponentRank:ranks.get(JSON.stringify([division.sport,division.division,opponent])) || null,
          opponentGP:Number.isInteger(team?.gp) && team.gp >= 0 ? team.gp : null,
          cappedMargin:average(team?.capped_margin_sum),
          venue, scoreFor:completed ? scoreFor : null, scoreAgainst:completed ? scoreAgainst : null,
          completed, dateISO, timeLabel, sortKey:(dateISO || '9999-99-99') + 'T' + sortTime,
          location:game.location || null, locationUrl:safeLocationURL(game.location_url), dateLabel:dateISO || game.date || 'Date TBD',
          status, opponentRecord:record, scoredPerGame:average(team?.pf),
          allowedPerGame:average(team?.pa), scoredLabel:favorite.sport === 'flag' ? 'PF/G' : 'GF/G',
          allowedLabel:favorite.sport === 'flag' ? 'PA/G' : 'GA/G'});
      }
    }
    return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }
  const sportNames = {flag:'JV Flag Football', '8u':'8U Boys Soccer', '6u':'6U Boys Soccer'};
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function safeSourceURL(value) {
    if (typeof value !== 'string') return null;
    try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? value : null; }
    catch { return null; }
  }
  // Keep aligned with the collector's reviewed Google Maps host/path allowlist.
  function safeLocationURL(value) {
    if (typeof value !== 'string' || /[\x00-\x20\x7f\\]/.test(value)) return null;
    try {
      const url = new URL(value);
      return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.port
        && ['google.com','www.google.com','maps.google.com','google.com.au','www.google.com.au','maps.google.com.au'].includes(url.hostname)
        && (url.pathname === '/maps' || url.pathname.startsWith('/maps/')) ? value : null;
    } catch { return null; }
  }
  function fieldHTML(r) {
    const label = escapeHTML(r.location || 'Field not listed');
    const url = r.location && safeLocationURL(r.locationUrl);
    return url ? `<a class="field-map" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} in Google Maps (opens in a new tab)">${label}</a>` : label;
  }
  const teamKey = r => `${r.sport}|${r.division}|${r.team}`;
  function filterRows(rows, filter = 'Upcoming', team = 'all') {
    return rows.filter(r => (team === 'all' || teamKey(r) === team) && (filter === 'All' || (filter === 'Results' ? r.completed : !r.completed && r.status !== 'Awaiting result')));
  }
  function groupDates(rows, filter = 'Upcoming', team = 'all') {
    const dates = new Map();
    for (const r of filterRows(rows, filter, team)) {
      if (!dates.has(r.dateISO)) dates.set(r.dateISO, {dateISO:r.dateISO, Dexter:[], Beckham:[]});
      dates.get(r.dateISO)[r.child].push(r);
    }
    return [...dates.values()].sort((a,b) => (a.dateISO || '9999').localeCompare(b.dateISO || '9999'));
  }
  function tableBody(rows, filter, team = 'all') {
    return filterRows(rows, filter, team).map(r => {
      const source = safeSourceURL(r.sourceUrl);
      const avg = n => Number.isFinite(n) ? n.toFixed(1) : '—';
      const date = r.dateISO ? new Intl.DateTimeFormat('en-US', {timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(r.dateISO+'T12:00:00Z')) : r.dateLabel;
      const rank = r.opponentRank || (r.opponentGP === 0 ? 'Unrated' : '—');
      return `<tr data-fixture-team="${escapeHTML(teamKey(r))}">
        <td class="fixture-date"><strong>${escapeHTML(date)}</strong><small>${escapeHTML(r.timeLabel)}</small><small>${fieldHTML(r)}</small></td>
        <th scope="row" class="fixture-match"><strong>${escapeHTML(r.team)}</strong> <span class="fixture-child">· ${escapeHTML(r.child)}</span> <span class="fixture-versus">vs <strong>${escapeHTML(r.opponent)}</strong> · ${escapeHTML(r.venue)}</span><small>${escapeHTML(sportNames[r.sport] || r.sport)} · ${escapeHTML(r.division)}</small><small class="fixture-coach">Opponent coach: ${escapeHTML(r.opponentCoach || 'Not listed')}</small></th>
        <td class="fixture-strength"><div class="strength-line"><b>Power rank ${escapeHTML(rank)}</b><span>${escapeHTML(r.opponentRecord || 'Record unavailable')} <span class="record-label">W–L–T</span></span><span>GP ${r.opponentGP ?? '—'}</span></div><div class="strength-line"><span>${r.scoredLabel} ${avg(r.scoredPerGame)}</span><span>${r.allowedLabel} ${avg(r.allowedPerGame)}</span><span>Cap Δ/G ${Number.isFinite(r.cappedMargin) && r.cappedMargin > 0 ? '+' : ''}${avg(r.cappedMargin)}</span></div>${r.opponentGP === 0 ? '<small>No completed games · strength not yet rated</small>' : ''}</td>
        <td class="fixture-result"><strong>${r.completed ? escapeHTML(r.status)+' '+r.scoreFor+'–'+r.scoreAgainst : escapeHTML(r.status)}</strong><details class="fixture-details"><summary>Details</summary><div><p>Our coach: ${escapeHTML(r.ourCoach || 'Not listed')}<br>Opponent coach: ${escapeHTML(r.opponentCoach || 'Not listed')}</p><p>${escapeHTML(r.dateLabel)} · ${escapeHTML(r.timeLabel)}<br>${fieldHTML(r)}<br>${r.completed ? 'Score shown us–them.' : 'No final score published.'}</p>${source ? `<a href="${escapeHTML(source)}" target="_blank" rel="noopener noreferrer">Public source</a>` : ''}</div></details></td></tr>`;
    }).join('') || '<tr><td colspan="4">No ' + (filter === 'All' ? 'games' : filter === 'Results' ? 'published results' : 'upcoming games') + ' listed in this view.</td></tr>';
  }
  function glanceTable(rows, filter, team = 'all') {
    const cell = fixtures => fixtures.map(r => `<div class="glance-fixture" data-fixture-team="${escapeHTML(teamKey(r))}"><strong>${escapeHTML(r.team)}</strong><span class="glance-time">${escapeHTML(r.timeLabel.replace(/ CT$/, ''))}</span><span>${r.venue === 'Home' ? 'vs' : '@'} ${escapeHTML(r.opponent)}</span><small>${fieldHTML(r)}</small>${r.completed ? `<b class="glance-result result-${r.status}">${r.status} ${r.scoreFor}–${r.scoreAgainst}</b>` : r.status === 'Awaiting result' ? '<small>Awaiting result</small>' : ''}${!r.dateISO && r.dateLabel !== 'Date TBD' ? `<small>${escapeHTML(r.dateLabel)}</small>` : ''}</div>`).join('');
    const body = groupDates(rows, filter, team).map(g => {
      const date = g.dateISO ? new Intl.DateTimeFormat('en-US', {timeZone:'UTC',weekday:'short',month:'numeric',day:'numeric'}).format(new Date(g.dateISO+'T12:00:00Z')) : 'Date TBD';
      return `<tr><th scope="row">${escapeHTML(date)}</th><td>${cell(g.Dexter)}</td><td>${cell(g.Beckham)}</td></tr>`;
    }).join('') || `<tr><td colspan="3">No ${filter === 'Results' ? 'published results' : filter === 'All' ? 'games' : 'upcoming games'} listed in this view.</td></tr>`;
    return `<div class="sbmsa-schedule-scroll"><table class="glance-table"><caption>Fall 2026 · vs = home, @ = away · scores us–them</caption><thead><tr><th scope="col">Date</th><th scope="col">Dexter</th><th scope="col">Beckham</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function scheduleContent(rows, filter, layout, team) {
    return layout === 'glance' ? glanceTable(rows, filter, team) : `
      <div class="sbmsa-schedule-scroll"><table><caption>Current power · selected mode · provisional · scores us–them</caption><thead><tr>${['When / field','Our team vs opponent','Opponent strength · current season','Status'].map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${tableBody(rows, filter, team)}</tbody></table></div>
      <details class="schedule-method"><summary>Strength guide &amp; sources</summary><p class="sbmsa-schedule-note">Opponent records and scoring reflect latest published season totals, not pre-game stats at each historical fixture. Small samples are provisional. Power rank uses the shared joint opponent-adjusted ridge model across the same sport/age, using the currently selected Raw (default) or capped mode, independent of filters. Disconnected result groups (even within a division) share only an assumed zero baseline; overall comparisons are provisional. T means tied competition rank. Caps: ±21 points in flag, ±3 goals in soccer per game. No division-strength adjustment or prediction. GP = games played; PF/PA = points scored/allowed; GF/GA = goals scored/allowed; /G = per game; Cap Δ/G = capped average margin. — means unavailable; unplayed teams are unrated. Past unscored games are awaiting results, not assumed draws. Official source and both coaches are in each fixture’s Details.</p></details>`;
  }
  function renderHTML(rows, filter = 'Upcoming', layout = 'glance', team = 'all') {
    const missing = rows.filter(r => r.status === 'Awaiting result').length;
    return `<div class="schedule-heading"><h2>Our teams</h2><span>Schedule &amp; opponent guide · All times CT</span></div>
      <div class="schedule-layout" role="group" aria-label="Schedule layout">${[["glance","At a glance"],["guide","Opponent guide"]].map(([key,label]) => `<button type="button" data-schedule-layout="${key}" aria-pressed="${key === layout}">${label}</button>`).join('')}</div>
      <div class="schedule-toolbar"><div class="sbmsa-schedule-filters" role="group" aria-label="Schedule view">${['Upcoming','Results','All'].map(f => `<button type="button" data-schedule-filter="${f}" aria-pressed="${f === filter}">${f}</button>`).join('')}</div><select data-schedule-team aria-label="Schedule team"><option value="all">All teams</option>${favorites.map(f => `<option value="${teamKey(f)}">${f.child} · ${f.team}</option>`).join('')}</select></div>
      ${missing ? `<p class="sbmsa-schedule-note">${missing} past game${missing === 1 ? '' : 's'} awaiting a published result. Choose All to see ${missing === 1 ? 'it' : 'them'}; these are not upcoming games.</p>` : ''}
      <div data-schedule-content>${scheduleContent(rows, filter, layout, team)}</div>`;
  }
  const styles = `
.sbmsa-schedules{min-width:0;max-width:100%;color:var(--ink);background:var(--paper);border:1px solid var(--line);padding:12px;box-sizing:border-box}
.sbmsa-schedules h2{font:700 24px/1.2 Georgia,serif;margin:0}.schedule-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px}.schedule-heading>span{font-size:12px;color:var(--muted)}
.sbmsa-schedules .sbmsa-schedule-note{font-size:12px;color:var(--muted);overflow-wrap:anywhere;margin:6px 0}.schedule-toolbar{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;margin:8px 0}.sbmsa-schedule-filters{display:flex;gap:4px}.sbmsa-schedules button,.sbmsa-schedules select{font:700 12px Arial,sans-serif;min-height:44px;padding:6px 10px;border:1px solid var(--line);background:transparent;color:var(--ink);max-width:100%;cursor:pointer}.sbmsa-schedules select{font-weight:normal}.sbmsa-schedules button[aria-pressed=true]{background:var(--ink);color:var(--paper)}.sbmsa-schedules :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sbmsa-schedules .sbmsa-schedule-scroll{width:100%;min-width:0}.sbmsa-schedules table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.sbmsa-schedules caption{text-align:left;font-size:11px;padding:5px 0;color:var(--muted)}.sbmsa-schedules th,.sbmsa-schedules td{padding:8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere;white-space:normal}.sbmsa-schedules thead th{background:var(--ink);color:var(--paper);font-size:11px}.sbmsa-schedules thead th:first-child{width:17%}.sbmsa-schedules thead th:nth-child(2){width:34%}.sbmsa-schedules thead th:nth-child(3){width:35%}.sbmsa-schedules thead th:last-child{width:14%}.sbmsa-schedules small{display:block;font-size:11px;font-weight:normal;margin-top:2px;color:var(--muted)}.fixture-match{font-weight:normal}.fixture-child{color:var(--muted)}.fixture-versus{display:block}.strength-line{display:flex;flex-wrap:wrap;gap:2px 10px;margin-bottom:3px}.strength-line>span,.strength-line>b{white-space:nowrap}.strength-line b{color:var(--green)}.record-label{font-size:10px;color:var(--muted)}.sbmsa-schedules summary{cursor:pointer;min-height:44px;align-content:center;font-size:12px}.fixture-details p{margin:4px 0}.fixture-details a{display:inline-flex;align-items:center;min-height:44px}.schedule-method{margin-top:4px}.schedule-method>summary{color:var(--muted)}
@media(max-width:700px){.sbmsa-schedules table,.sbmsa-schedules tbody{display:block}.sbmsa-schedules thead{display:none}.sbmsa-schedules tr{display:grid;grid-template-columns:90px minmax(0,1fr);border-bottom:1px solid var(--line);padding:7px 0}.sbmsa-schedules th,.sbmsa-schedules td{border:0;padding:2px 4px}.sbmsa-schedules .fixture-date{grid-column:1;grid-row:1}.sbmsa-schedules .fixture-match{grid-column:2;grid-row:1}.sbmsa-schedules .fixture-strength{grid-column:1/-1;grid-row:2;padding-top:6px}.sbmsa-schedules .fixture-result{grid-column:1/-1;grid-row:3;display:flex;align-items:baseline;justify-content:space-between;gap:10px}.fixture-details{max-width:72%;text-align:right}.fixture-details>div{text-align:left}.sbmsa-schedules td[colspan]{grid-column:1/-1}.sbmsa-schedules caption{display:block}.schedule-toolbar{gap:4px}.schedule-toolbar select{flex:1;min-width:0}.sbmsa-schedules button{padding-inline:8px}.strength-line{gap:2px 8px}.sbmsa-schedules .fixture-date strong{font-size:11px}}
.sbmsa-schedules a.field-map{display:inline;min-height:0;color:inherit;text-decoration:underline;text-underline-offset:2px}.sbmsa-schedules a.field-map:hover{color:var(--accent)}
.schedule-layout{display:flex;gap:4px;margin-top:8px}
.sbmsa-schedules .glance-table{display:table;font-size:12px}
.sbmsa-schedules .glance-table caption{display:table-caption}
.sbmsa-schedules .schedule-toolbar select{min-width:110px}
@media(max-width:350px){.schedule-toolbar{gap:4px 0}.sbmsa-schedule-filters{gap:2px}.sbmsa-schedules .sbmsa-schedule-filters button{padding-inline:3px;min-width:44px;flex:0 0 auto}}
.sbmsa-schedules .glance-table thead{display:table-header-group}
.sbmsa-schedules .glance-table tbody{display:table-row-group}
.sbmsa-schedules .glance-table tr{display:table-row;padding:0}
.sbmsa-schedules .glance-table th,.sbmsa-schedules .glance-table td{display:table-cell;padding:6px;border-bottom:1px solid var(--line)}
.sbmsa-schedules .glance-table thead th:first-child{width:17%}
.sbmsa-schedules .glance-table thead th:nth-child(2),.sbmsa-schedules .glance-table thead th:last-child{width:41.5%}
.glance-table tbody th{font-weight:normal;color:var(--muted)}
.glance-fixture{line-height:1.4}.glance-fixture>strong{display:block}.glance-fixture>span{margin-right:4px}.glance-time{white-space:nowrap}
.glance-fixture+.glance-fixture{border-top:1px dashed var(--line);margin-top:6px;padding-top:6px}
.glance-result{display:block}.result-W{color:var(--green)}.result-L{color:var(--accent)}
@media(max-width:700px){.sbmsa-schedules .glance-table th,.sbmsa-schedules .glance-table td{padding:5px 4px}.sbmsa-schedules .glance-table thead th:first-child{width:19%}.sbmsa-schedules .glance-table thead th:nth-child(2),.sbmsa-schedules .glance-table thead th:last-child{width:40.5%}.glance-fixture>span{display:block}}
`;
  const viewStates = new WeakMap();
  function render(data, containerElement, today) {
    const doc = containerElement.ownerDocument;
    if (!doc.getElementById('sbmsa-schedules-style')) {
      const style = doc.createElement('style');
      style.id = 'sbmsa-schedules-style'; style.textContent = styles; doc.head.appendChild(style);
    }
    const rows = buildRows(data, today);
    containerElement.classList.add('sbmsa-schedules');
    // Listeners live only on replaceable descendants; no document/container handlers accumulate.
    const state=viewStates.get(containerElement)||{filter:'Upcoming',layout:'glance',team:'all'};
    viewStates.set(containerElement,state);
    containerElement.innerHTML = renderHTML(rows,state.filter,state.layout,state.team);
    const buttons = containerElement.querySelectorAll('[data-schedule-filter]');
    const body = containerElement.querySelector('[data-schedule-content]');
    const layouts = containerElement.querySelectorAll('[data-schedule-layout]');
    let activeLayout = state.layout;
    const select = containerElement.querySelector('[data-schedule-team]');
    let activeFilter = state.filter;
    const update = () => {
      Object.assign(state,{filter:activeFilter,layout:activeLayout,team:select.value});
      body.innerHTML = scheduleContent(rows, activeFilter, activeLayout, select.value);
    };
    for (const button of layouts) button.addEventListener('click', () => {
      activeLayout = button.dataset.scheduleLayout;
      for (const other of layouts) other.setAttribute('aria-pressed', String(other === button));
      update();
    });
    select.addEventListener('change', update);
    for (const button of buttons) button.addEventListener('click', () => {
      const filter = button.dataset.scheduleFilter;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      activeFilter = filter;
      update();
    });
  }
  return {buildRows, chicagoDate, groupDates, filterRows, escapeHTML, safeSourceURL, safeLocationURL, renderHTML, render};
});
