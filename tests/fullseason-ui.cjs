// Real-publication parity and fail-visible coverage, on both dashboards.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']}),base=process.env.TEST_URL,girls=process.env.GIRLS==='1',sports=girls?['5ug']:['flag','8u','6u'];assert.ok(base);try{
for(const width of [320,390,1400]){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'?fullseason='+Date.now()+'#rankings');await p.waitForFunction(()=>typeof data!=='undefined'&&data?.powerCoverage);
 const initial=await p.evaluate(()=>({coverage:data.powerCoverage,mode:data.ratingMode}));assert.equal(initial.mode,'capped');assert.ok(initial.coverage.included>0);
 for(const mode of ['capped','raw'])for(const age of sports){await p.locator('#tab-rankings').click();if(!girls)await p.locator(`[data-sport="${age}"]`).click();await p.locator('#'+mode).click();
 const checks=await p.evaluate(({age,mode,girls})=>{
  const r=SBMSARatings.compute(data.divisions,age,mode),keys=r.map(t=>[t.team,t.division,t.rankText]);
  const shown=[...document.querySelectorAll('#rows .row')].map(el=>[el.dataset.team,el.dataset.division||el.querySelector('.division').textContent.split(' · ')[0],el.querySelector('.rank').textContent]);
  const actual=SBMSALeagueSchedule.buildRows(data,age).flatMap(g=>[g.home,g.away]).every(t=>r.some(x=>x.team===t.team&&x.division===t.division&&x.rank===t.rank&&x.power===t.power));
  const playoff=[...SBMSAPlayoffs.profiles(data,age).values()].every(t=>r.some(x=>x.team===t.team&&x.division===t.division&&x.power===t.power));
  const advanced=girls||[...document.querySelectorAll('#stats-body tr[data-team]')].every(el=>{const t=r.find(t=>t.team===el.dataset.team&&t.division===el.querySelector('.division').textContent);return t&&el.children[3].textContent===t.rankText;});
  return {shown,keys,actual,playoff,advanced,summary:SBMSARatings.divisionSummary(data.divisions,age,mode,data.powerCoverage)};
 },{age,mode,girls});assert.deepEqual(checks.shown,checks.keys);assert.ok(checks.actual&&checks.playoff&&checks.advanced);
 }
 await p.locator('#power-scope summary').click();assert.match(await p.locator('#power-scope').innerText(),/selection creates bias/);assert.match(await p.locator('#power-scope').innerText(),/regular-season-only Raw/);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:(process.env.QA_DIR||'/tmp')+`/fullseason-${girls?'girls':'boys'}-${width}.png`,fullPage:true});
 assert.deepEqual(errors,[]);await p.close();
}
// A fetch failure cannot silently look like complete full-season evidence.
const p=await b.newPage();await p.route('**/playoffs.json',r=>r.abort());await p.goto(base+'?missing='+Date.now()+'#rankings');await p.waitForFunction(()=>typeof data!=='undefined'&&data?.powerCoverage);assert.equal(await p.evaluate(()=>data.powerCoverage.missing),true);assert.match(await p.locator('#power-scope').innerText(),/Incomplete feed/);await p.close();
const q=await b.newPage();await q.route('**/playoffs.json',async route=>{const response=await route.fetch();const payload=await response.json();for(const s of payload.sources){s.status='error';s.error='QA-only simulated source failure';s.last_successful_check='2026-09-01T00:00:00Z';}await route.fulfill({response,json:payload});});await q.goto(base+'?retained='+Date.now()+'#rankings');await q.waitForFunction(()=>typeof data!=='undefined'&&data?.powerCoverage);assert.ok(await q.evaluate(()=>data.powerCoverage.included>0));if(!girls)await q.locator('[data-sport="8u"]').click();assert.match(await q.locator('#power-scope').innerText(),/Stale \/ retained coverage/);await q.close();
console.log(JSON.stringify({fullseason:true,allRankConsumers:true,selectedModes:true,widths:[320,390,1400],missingFeed:true,retainedFeed:true,girls}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
