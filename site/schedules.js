(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SBMSASchedules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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
          venue, scoreFor:completed ? scoreFor : null, scoreAgainst:completed ? scoreAgainst : null,
          completed, dateISO, timeLabel, sortKey:(dateISO || '9999-99-99') + 'T' + sortTime,
          location:game.location || null, dateLabel:dateISO || game.date || 'Date TBD',
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
  function filterRows(rows, filter = 'Upcoming') {
    return rows.filter(r => filter === 'All' || (filter === 'Results' ? r.completed : !r.completed && r.status !== 'Awaiting result'));
  }
  function tableBody(rows, filter) {
    const selected = filterRows(rows, filter);
    return selected.map(r => {
      const source = safeSourceURL(r.sourceUrl);
      const avg = n => Number.isFinite(n) ? n.toFixed(1) : '—';
      return `<tr><th scope="row">${escapeHTML(r.child)} · ${escapeHTML(r.team)}<small>${escapeHTML(sportNames[r.sport] || r.sport)} · ${escapeHTML(r.division)}</small></th>
        <td>${escapeHTML(r.dateLabel)}<small>${escapeHTML(r.timeLabel)}</small><small>${escapeHTML(r.location || 'Field not listed')}</small></td>
        <td>${escapeHTML(r.venue)}<small>${escapeHTML(r.opponent)}</small></td>
        <td>${escapeHTML(r.opponentCoach ? 'Coach: ' + r.opponentCoach : 'Coach not listed')}<small>${escapeHTML(r.opponentRecord || 'Record not listed')} (W–L–T)</small></td>
        <td>${escapeHTML(r.scoredLabel)} ${avg(r.scoredPerGame)}<small>${escapeHTML(r.allowedLabel)} ${avg(r.allowedPerGame)}</small></td>
        <td><strong>${escapeHTML(r.status)}</strong>${r.completed ? `<small>${escapeHTML(r.scoreFor)}–${escapeHTML(r.scoreAgainst)} (us–them)</small>` : ''}${source ? `<small><a href="${escapeHTML(source)}" target="_blank" rel="noopener noreferrer">Public source</a></small>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6">No ' + (filter === 'All' ? 'games' : filter === 'Results' ? 'published results' : 'upcoming games') + ' listed in this view.</td></tr>';
  }
  function renderHTML(rows, filter = 'Upcoming') {
    const missing = rows.filter(r => r.status === 'Awaiting result').length;
    return `<h2>Our teams — schedule &amp; opponent guide</h2>
      <p class="sbmsa-schedule-note">Dexter: Buccaneers (Burrow) &amp; Vipers (Messi). Beckham: Arsenal (Pulisic). All times Central (CT).</p>
      <div class="sbmsa-schedule-filters" role="group" aria-label="Schedule view">${['Upcoming','Results','All'].map(f => `<button type="button" data-schedule-filter="${f}" aria-pressed="${f === filter}">${f}</button>`).join('')}</div>
      ${missing ? `<p class="sbmsa-schedule-note">${missing} past game${missing === 1 ? '' : 's'} awaiting a published result. Choose All to see ${missing === 1 ? 'it' : 'them'}; these are not upcoming games.</p>` : ''}
      <div class="sbmsa-schedule-scroll" tabindex="0" role="region" aria-label="Our teams schedule; scroll horizontally for more columns"><table><caption>Favorite-team fixtures · scores shown from our team’s perspective</caption><thead><tr>${['Child / team (sport)','Date / time CT / field','Home / away · opponent','Opponent coach / record','Opponent scored / allowed','Result / source'].map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${tableBody(rows, filter)}</tbody></table></div>
      <p class="sbmsa-schedule-note">Opponent records and scoring reflect latest published season totals, not pre-game stats at each historical fixture. Small samples are provisional. PF/PA = points scored/allowed; GF/GA = goals scored/allowed; /G = per game. — means unavailable. Past unscored games are awaiting results, not assumed draws.</p>`;
  }
  const styles = `.sbmsa-schedules{min-width:0;max-width:100%;margin-top:28px;color:var(--ink,#202b29);background:var(--paper,#faf8f3);border:1px solid var(--line,#cdd2c7);padding:16px;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}.sbmsa-schedules h2{font:700 26px/1.2 Georgia,serif;margin:0}.sbmsa-schedules .sbmsa-schedule-note{font-size:12px;color:var(--muted,#58645f);overflow-wrap:anywhere;margin:10px 0}.sbmsa-schedules .sbmsa-schedule-filters{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.sbmsa-schedules button{font:700 13px Arial,sans-serif;min-height:44px;padding:8px 12px;border:1px solid var(--line,#cdd2c7);background:transparent;color:var(--ink,#202b29);cursor:pointer}.sbmsa-schedules button[aria-pressed=true]{background:var(--ink,#202b29);color:var(--paper,#faf8f3)}.sbmsa-schedules :focus-visible{outline:2px solid var(--accent,#a83224);outline-offset:3px}.sbmsa-schedules .sbmsa-schedule-scroll{width:100%;max-width:100%;min-width:0;overflow-x:auto;overscroll-behavior-x:contain}.sbmsa-schedules table{width:100%;min-width:800px;table-layout:fixed;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.sbmsa-schedules caption{text-align:left;padding:8px 0;color:var(--muted,#58645f)}.sbmsa-schedules th,.sbmsa-schedules td{padding:10px 8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line,#cdd2c7);overflow-wrap:anywhere;white-space:normal}.sbmsa-schedules thead th{background:var(--ink,#202b29);color:var(--paper,#faf8f3);font-size:11px}.sbmsa-schedules small{display:block;font-size:11px;font-weight:normal;margin-top:3px}.sbmsa-schedules a{color:var(--accent,#a83224)}@media(max-width:600px){.sbmsa-schedules{padding:12px}.sbmsa-schedules h2{font-size:23px}}`;
  function render(data, containerElement, today) {
    const doc = containerElement.ownerDocument;
    if (!doc.getElementById('sbmsa-schedules-style')) {
      const style = doc.createElement('style');
      style.id = 'sbmsa-schedules-style'; style.textContent = styles; doc.head.appendChild(style);
    }
    const rows = buildRows(data, today);
    containerElement.classList.add('sbmsa-schedules');
    // Listeners live only on replaceable descendants; no document/container handlers accumulate.
    containerElement.innerHTML = renderHTML(rows);
    const buttons = containerElement.querySelectorAll('[data-schedule-filter]');
    const body = containerElement.querySelector('tbody');
    for (const button of buttons) button.addEventListener('click', () => {
      const filter = button.dataset.scheduleFilter;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      body.innerHTML = tableBody(rows, filter);
    });
  }
  return {buildRows, chicagoDate, filterRows, escapeHTML, safeSourceURL, renderHTML, render};
});
