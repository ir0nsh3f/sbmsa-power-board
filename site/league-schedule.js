(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./schedules.js'),require('./ratings.js'));
  else root.SBMSALeagueSchedule=factory(root.SBMSASchedules,root.SBMSARatings);
})(typeof globalThis!=='undefined'?globalThis:this,function(S,R){
  'use strict';
  const key=(division,team)=>JSON.stringify([division,team]);
  function profiles(data,sport){
    const all=R.compute(data?.divisions||[],sport),rated=all.filter(t=>t.rank);
    return {teams:new Map(all.map(t=>[key(t.division,t.team),t])),ratedCount:rated.length,cutoff:Math.ceil(rated.length/4)};
  }
  function highlight(row,ratedCount){
    const {away:a,home:b}=row,cutoff=Math.ceil(ratedCount/4);
    if(row.status!=='Upcoming'||!row.dateISO||![a,b].every(t=>t&&t.gp>=3&&t.rank>0&&Number.isFinite(t.rate)))return null;
    if(a.rank<=cutoff&&b.rank<=cutoff)return {label:'Top matchup',reason:`Both power ranks in top ${cutoff} of ${ratedCount} rated teams (rounded-up top quarter; ties included). Both have at least 3 GP.`};
    const gap=Math.abs(a.rate-b.rate);
    if(a.division===b.division&&gap<=.15+1e-12)return {label:'Close records',reason:`Same division; win-rate gap ${(gap*100).toFixed(1)} percentage points (≤15). Both have at least 3 GP. This does not predict a close game.`};
    return null;
  }
  const favorites={flag:['Burrow','Buccaneers'],'8u':['Pulisic','Arsenal'],'6u':['Messi','Vipers']};
  function buildRows(data,sport,today=new Date()){
    today=typeof today==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(today)?today:S.chicagoDate(new Date(today));
    const p=profiles(data,sport),rows=[];
    for(const d of (data?.divisions||[]).filter(d=>d.sport===sport))for(const [index,g] of (d.schedule||[]).entries()){
      const start=typeof g.start_iso==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(g.start_iso)?Date.parse(g.start_iso):NaN;
      const dateISO=Number.isFinite(start)?S.chicagoDate(new Date(start)):/^\d{4}-\d{2}-\d{2}$/.test(g.date_iso||'')?g.date_iso:null;
      const completed=[g.away_score,g.home_score].every(n=>Number.isInteger(n)&&n>=0);
      const profile=name=>p.teams.get(key(d.division,name))||{team:name,coach:null,rank:null,rankText:'—',gp:null};
      const row={id:JSON.stringify([sport,d.division,index]),sport,division:d.division,away:profile(g.away),home:profile(g.home),
        dateISO,start:Number.isFinite(start)?start:null,timeLabel:Number.isFinite(start)?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(start)):g.time||'Time TBD',
        completed,awayScore:completed?g.away_score:null,homeScore:completed?g.home_score:null,
        status:completed?'Final':dateISO&&dateISO<today?'Awaiting result':dateISO?'Upcoming':'Date TBD',
        location:g.location,locationUrl:S.safeLocationURL(g.location_url),sourceUrl:S.safeSourceURL(d.url),
        ourTeam:favorites[sport]?.[0]===d.division&&[g.away,g.home].includes(favorites[sport][1])};
      row.highlight=highlight(row,p.ratedCount);rows.push(row);
    }
    return rows.sort((a,b)=>(a.dateISO||'9999').localeCompare(b.dateISO||'9999')||(a.start??-Infinity)-(b.start??-Infinity)||a.division.localeCompare(b.division)||a.id.localeCompare(b.id));
  }
  function filterRows(rows,{filter='Upcoming',division='all',query='',watchlist=false}={}){
    query=query.trim().toLowerCase();
    return rows.filter(r=>(division==='all'||r.division===division)&&(!watchlist||r.highlight)&&
      (filter==='All'||(filter==='Results'?r.completed:!r.completed&&r.status!=='Awaiting result'))&&
      [r.away,r.home].some(t=>(t.team+' '+(t.coach||'')).toLowerCase().includes(query)));
  }
  function groupDates(rows){
    const groups=new Map();for(const r of rows){if(!groups.has(r.dateISO))groups.set(r.dateISO,{dateISO:r.dateISO,rows:[]});groups.get(r.dateISO).rows.push(r);}return [...groups.values()];
  }
  const e=S.escapeHTML;
  const record=t=>['w','l','t'].every(k=>Number.isInteger(t[k]))?`${t.w}–${t.l}–${t.t}`:'—';
  function projectionFor(row,payload,now=Date.now()){
    if(row.sport!=='flag'||row.completed||!Number.isFinite(row.start)||row.start<=now||payload?.model_version!=='flag-huber-ridge-v1')return null;
    return (payload.forecasts||[]).find(f=>{const id=f.game_id;return Array.isArray(id)&&id.length===6&&id[0]==='fall-2026'&&id[1]===row.sport&&id[2]===row.division&&id[3]===row.home.team&&id[4]===row.away.team&&Date.parse(id[5])===row.start;})||null;
  }
  function projectionLine(r,options,detail=false){
    if(!options.showProjections||r.sport!=='flag')return '';
    const f=projectionFor(r,options.projections,options.now??Date.now());
    if(!f)return !r.completed&&r.status==='Upcoming'?(detail?'<p>Projection unavailable · kickoff passed/unknown, no division results, or no current capture.</p>':'<span class="league-projection">Model · unavailable</span>'):'';
    if(!detail){
      const spread=Math.round(Math.abs(f.margin_home));
      const line=spread===0?'Pick’em':`${f.margin_home>0?r.home.team:r.away.team} −${spread}`;
      return `<span class="league-projection"><b>Model</b> · ${e(line)} · Total ${e(Math.round(f.total))}</span>`;
    }
    const signed=n=>n>0?'+'+n:String(n);
    return `<p class="league-projection-detail"><b>Experimental · very small sample</b><br>Home margin ${e(signed(f.margin_home))} (${e(signed(f.margin_range[0]))} to ${e(signed(f.margin_range[1]))}) · Total ${e(f.total)} (${e(f.total_range[0])}–${e(f.total_range[1])})<br>Approx. 95% model-based ranges · GP away ${e(f.gp_away)} / home ${e(f.gp_home)} · ${e(f.division_games)} division games.<br>Prior assumptions: prior-heavy at 0–2 GP; no home-field advantage or cross-division calibration.${f.gp_away===0||f.gp_home===0?' 0 GP team: prior-based extrapolation.':''} See Projection assumptions &amp; archive for the full model.</p>`;
  }
  function lastPregameFor(row,payload){
    if(row.sport!=='flag'||!row.completed||!Number.isFinite(row.start)||payload?.schema_version!==1||payload.season!=='fall-2026'||payload.selection!=='last-observed-public-pregame-v1'||!Array.isArray(payload.forecasts))return null;
    const aware=v=>typeof v==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN;
    const matches=payload.forecasts.filter(f=>{
      const id=f?.game_id,observed=aware(f?.observed_public_at),captured=aware(f?.captured_at);
      return Array.isArray(id)&&id.length===6&&id[0]==='fall-2026'&&id[1]===row.sport&&id[2]===row.division&&id[3]===row.home.team&&id[4]===row.away.team&&aware(id[5])===row.start&&
        f.model_version==='flag-huber-ridge-v1'&&Number.isFinite(f.margin_home)&&Number.isFinite(f.total)&&f.total>=0&&
        /^[a-f0-9]{64}$/.test(f.sha256)&&f.capture_path==='captures/'+f.sha256+'.json'&&captured<=observed&&observed<row.start;
    });
    return matches.length===1?matches[0]:null;
  }
  function lastPregameDetail(r,payload){
    if(r.sport!=='flag'||!r.completed)return '';
    const f=lastPregameFor(r,payload);
    if(!f)return '<p class="league-pregame">No archived pregame model</p>';
    const spread=Math.round(Math.abs(f.margin_home)),line=spread===0?'Pick’em':`${f.margin_home>0?r.home.team:r.away.team} −${spread}`;
    const timestamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(f.observed_public_at));
    return `<div class="league-pregame"><p><b>Last pregame model</b> · ${e(line)} · Total ${e(Math.round(f.total))}</p><p>Observed public ${e(timestamp)} CT</p><p>Experimental · prior-heavy, not market lines. Latest verified public observation before this exact kickoff; not a final-score refit.</p><a href="./projections/${e(f.capture_path)}" target="_blank" rel="noopener noreferrer">Archived capture</a> · <a href="./projections/publication/${e(f.sha256)}.json" target="_blank" rel="noopener noreferrer">Publication receipt</a> · <a href="./projection-method.html">Model assumptions</a></div>`;
  }
  function renderRows(rows,options={}){
    return groupDates(rows).map(g=>`<section class="league-day"><h3>${g.dateISO?e(new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(g.dateISO+'T12:00:00Z'))):'Date TBD'}</h3>${g.rows.map(r=>{
      const identity=t=>`<span class="league-team"><b>${e(t.team)}</b> <small><span class="league-rank">${t.rank?'#':''}${e(t.rankText)}</span> · ${record(t)}</small></span>`;
      const field=e(r.location||'Field not listed');
      const map=r.location&&r.locationUrl?`<a class="field-map" href="${e(r.locationUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${field} in Google Maps (opens in a new tab)">${field}</a>`:field;
      return `<details class="league-fixture${r.ourTeam?' league-fixture-ours':''}" data-league-fixture="${e(r.id)}"><summary title="Expand for coaches, games played and source"><span class="league-time">${e(r.timeLabel)}</span><span class="league-match">${identity(r.away)} <span class="league-at">@</span> ${identity(r.home)}${r.completed?` <b class="league-score">${r.awayScore}–${r.homeScore} Final</b>`:''}${projectionLine(r,options)}</span><span class="league-meta">${e(r.division)} · ${map}${r.ourTeam?' · <b class="league-ours">Our team</b>':''}${r.highlight?` · <b class="league-badge">${e(r.highlight.label)}</b>`:''}${r.status==='Awaiting result'?' · Awaiting result':''}<span class="league-expand" aria-hidden="true"> ▾</span></span></summary><div class="league-detail">${lastPregameDetail(r,options.pregameResults)}${projectionLine(r,options,true)}${[r.away,r.home].map(t=>`<p><b>${e(t.team)}</b> · Coach: ${e(t.coach||'Not listed')} · ${t.gp??'—'} GP${t.gp===0?' · Unrated':t.gp<3?' · Small sample (fewer than 3 GP)':''}</p>`).join('')}${r.highlight?`<p>${e(r.highlight.reason)}</p>`:''}<p>${r.completed?'Final score shown away–home.':'No final score published.'} ${r.sourceUrl?`<a href="${e(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official schedule</a>`:''}</p></div></details>`;
    }).join('')}</section>`).join('')||'<p class="league-empty">No games match these filters. Try All or turn off Watchlist.</p>';
  }
  function projectionGuide(payload){
    return `<p class="league-note" data-projection-caution hidden><b>Experimental · very small sample.</b> Model estimates, not market lines. Broad uncertainty; tap a matchup for ranges &amp; GP.</p><details class="league-method" data-projection-guide hidden><summary>Projection assumptions &amp; archive</summary><p><b>Experimental · very small sample.</b> The compact line names the favorite with a negative spread; rounded zero is Pick’em. Total means combined points. In matchup details, home margin means home points minus away points: positive favors home, negative favors away. Whole-point estimates and broad approximate 95% model-based predictive ranges, not validated calibration. These projections do not change rankings or Watchlist.</p><p>Each JV Flag division is fitted separately to dated, completed scores observed at collection. Expected scoring = division baseline + team offense + opponent defense (points allowed). Huber loss limits each score’s influence beyond a 14-point residual. Ridge priors: baseline 21 points with 12 score-observations of weight; offense and defense centered at zero with 6 observations each. This is deliberately prior-heavy, especially at 0–2 GP. No home-field advantage and no cross-division strength calibration.</p><p>Assumptions, not learned calibration: residual standard deviation at least 14 points per team; ranges add ridge parameter uncertainty and assume independent team-score noise. Expected team points constrained to 0–70, total range floored at zero. No time-decay, roster or injury inputs. Unknown kickoffs, started games, partial scores and divisions without dated results receive no projection. Captures require kickoff more than 30 minutes after collection; stale projections are hidden at kickoff.</p><p>Model <code>flag-huber-ridge-v1</code>. ${payload?`Current calculation: ${e(payload.generated_at)}; underlying capture: ${e(payload.captured_at)} (UTC).`:'Current projections unavailable; try refreshing later.'} Capture time is not exact publication time. Immutable snapshots retain training cutoff, scores, hash, configuration and exact fixture identity. Separate public-readback receipts establish when a capture was observed online. Evaluation uses only the first observed-public pregame forecast; none are reconstructed or backdated. No validated backtest yet.</p><p><a href="./projections/current.json">Current projections</a> · <a href="./projections/index.json">Capture archive index</a> · <a href="./projection-method.html">Full model &amp; provenance</a></p></details>`;
  }
  const states=new WeakMap();
  function render(data,container,options={}){
    const state=states.get(container)||{filter:'Upcoming',watchlist:false,showProjections:false};states.set(container,state);
    const rows=buildRows(data,options.sport||'flag');
    const update=()=>{
      const shown=filterRows(rows,{...options,...state});
      container.querySelector('[data-league-content]').innerHTML=renderRows(shown,{showProjections:state.showProjections,projections:data.projections,pregameResults:data.pregameResults});
      container.querySelector('[data-league-projections]')?.setAttribute('aria-pressed',String(state.showProjections));
      const guide=container.querySelector('[data-projection-guide]');if(guide)guide.hidden=!state.showProjections;
      const caution=container.querySelector('[data-projection-caution]');if(caution)caution.hidden=!state.showProjections;
      container.querySelector('[data-league-count]').textContent=`${shown.length} / ${rows.length} official fixtures · ${rows.filter(r=>r.highlight).length} upcoming highlights`;
      container.querySelectorAll('[data-league-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.leagueFilter===state.filter)));
      container.querySelector('[data-league-watch]').setAttribute('aria-pressed',String(state.watchlist));
      clearTimeout(state.timer);
      if(state.showProjections){const next=Math.min(...rows.map(r=>r.start).filter(t=>t>Date.now()));if(Number.isFinite(next))state.timer=setTimeout(update,Math.min(2147483647,Math.max(1,next-Date.now()+10)));}
    };
    container.innerHTML=`<div class="league-heading"><h2>League schedule</h2><span>Fall 2026 · All dates &amp; times Central</span></div><div class="league-toolbar"><div role="group" aria-label="League schedule view">${['Upcoming','Results','All'].map(f=>`<button data-league-filter="${f}">${f}</button>`).join('')}</div><button data-league-watch>Watchlist</button>${(options.sport||'flag')==='flag'?'<button data-league-projections aria-pressed="false">Experimental projections</button>':''}</div>${(options.sport||'flag')==='flag'?projectionGuide(data.projections):''}<p class="league-note" data-league-count role="status"></p><p class="league-note">Away @ home · # = power rank · W–L–T. Disconnected comparisons are provisional, even within divisions.</p><details class="league-method"><summary>Highlights &amp; ranking guide</summary><p>Highlights describe current records, not predictions or playoff stakes. No playoff or tiebreak simulation. Both teams need at least 3 games played and a rated rank; undated, completed and past unscored games receive no badge.</p><p><b>Top matchup</b> takes priority: both competition ranks ≤ ceil(rated teams ÷ 4), across all divisions of this sport/age. Ties at the cutoff are included, so more than a quarter can qualify. The denominator includes rated teams with 1–2 GP, but they cannot earn a badge.</p><p><b>Close records</b>: same division, win-rate gap ≤15 percentage points; not a prediction of a close game. Win rate = (W + ½T) / GP. Watchlist shows only upcoming highlighted games; it does not reorder them.</p><p>Ranks use joint opponent-adjusted power with ridge shrinkage and game caps (±21 flag, ±3 soccer), independent of descriptive Raw mode and filters. Disconnected result groups share an assumed baseline, not measured relative strength. T = tied competition rank. All records and ranks are latest season totals, not historical pregame stats; GP 0 is unrated, GP 1–2 is a small sample. No division-strength adjustment. Same-day unscored games remain upcoming; older unscored games are awaiting results in All, never assumed draws. Undated fixtures sort last; unknown times precede known times on a date.</p></details><div data-league-content></div>`;
    container.querySelectorAll('[data-league-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.leagueFilter;update();}));
    container.querySelector('[data-league-watch]').addEventListener('click',()=>{state.watchlist=!state.watchlist;update();});
    container.querySelector('[data-league-projections]')?.addEventListener('click',()=>{state.showProjections=!state.showProjections;update();});
    update();
  }
  return {profiles,highlight,buildRows,filterRows,groupDates,projectionFor,lastPregameFor,renderRows,render};
});
