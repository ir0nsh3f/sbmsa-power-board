const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']}),base=process.env.TEST_URL,girls=process.env.GIRLS==='1';try{for(const width of [320,390,1400]){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'?records='+Date.now());await p.waitForFunction(()=>typeof data!=='undefined'&&data?.powerCoverage);
 for(const sport of girls?['5ug']:['flag','8u','6u']){
 if(!girls)await p.locator(`[data-sport="${sport}"]`).click();
 const checks=await p.evaluate(({sport,girls})=>{
 const ds=data.divisions.filter(d=>d.sport===sport),all=ds.flatMap(d=>d.teams.map(t=>({...t,division:d.division}))),record=t=>`${t.w}–${t.l}–${t.t}`;
 const rankings=[...document.querySelectorAll('#rows .row')].every(el=>{const t=all.find(t=>t.team===el.dataset.team&&t.division===(el.dataset.division||el.querySelector('.division').textContent.split(' · ')[0]));return t&&el.querySelector('.record').textContent===record(t)&&el.querySelector('.record').title.includes('Regular')&&t.gp===t.regular_record.gp+t.playoff_record.gp;});
 const league=SBMSALeagueSchedule.buildRows(data,sport);const rows=SBMSALeagueSchedule.renderRows(league),dom=document.createElement('div');dom.innerHTML=rows;const schedule=[...dom.querySelectorAll('.league-team small')].every(el=>el.title.includes('Regular'));
 const advanced=girls||[...document.querySelectorAll('#stats-body tr[data-team]')].every(el=>{const t=all.find(t=>t.team===el.dataset.team&&t.division===el.querySelector('.division').textContent);return t&&el.children[5].textContent===record(t)&&el.children[4].textContent.startsWith(String(t.gp));});
 const ours=girls||SBMSASchedules.buildRows(data).filter(r=>r.sport===sport&&r.opponentRecord).every(r=>{const t=all.find(t=>t.team===r.opponent&&t.division===r.opponentDivision);return t&&r.opponentRecord===record(t)&&r.opponentGP===t.gp&&r.opponentScoredGP===t.scored_gp;});
 const records=all.filter(t=>['Celtics','Celtic','Arsenal','Vipers','Buccaneers','Rainbow Unicorns'].includes(t.team)).map(t=>({sport,division:t.division,team:t.team,before:t.regular_record,after:{w:t.w,l:t.l,t:t.t,gp:t.gp},playoffs:t.playoff_record,scoredGP:t.scored_gp}));return {rankings,schedule,advanced,ours,records};
 },{sport,girls});assert.ok(checks.rankings&&checks.schedule&&checks.advanced&&checks.ours,JSON.stringify(checks));console.log(JSON.stringify({width,...checks}));
 }
 const routes=girls?['#league-schedule','#rainbow-schedule','#playoffs','#rankings']:['#advanced','#our-teams','#league-schedule','#playoffs','#rankings'];
 for(const hash of routes){await p.evaluate(h=>location.hash=h,hash);await p.waitForTimeout(120);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),hash+' overflow');}
 await p.locator('#tab-rankings').click();
 if(!girls){await p.locator('[data-sport="6u"]').click();const c=p.locator('#rows .row[data-team="Celtics"]');const expected=await p.evaluate(()=>{const t=data.divisions.find(d=>d.sport==='6u'&&d.division==='Messi').teams.find(t=>t.team==='Celtics');return `${t.w}–${t.l}–${t.t}`});assert.equal(await c.locator('.record').innerText(),expected);console.log('PUBLIC/LOCAL Celtics DOM:',await c.innerText());}
 await p.screenshot({path:(process.env.QA_DIR||'/tmp')+`/records-${girls?'girls':'boys'}-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await p.close();
 }
 const p=await b.newPage();await p.route('**/playoffs.json',r=>r.abort());await p.goto(base+'?records-fallback='+Date.now());await p.waitForFunction(()=>typeof data!=='undefined'&&data?.powerCoverage);assert.ok(await p.evaluate(()=>data.divisions.every(d=>d.teams.every(t=>t.gp===t.regular_record.gp&&t.playoff_record.gp===0))));await p.close();
 console.log('Combined record consumers, breakdowns, missing fallback, responsive layouts verified');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
