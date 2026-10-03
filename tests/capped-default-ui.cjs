// Fresh routes must use capped INPUTS, not merely selected-looking buttons.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../site/ratings.js');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 const base=process.env.TEST_URL;assert.ok(base,'Set TEST_URL to local or public board');
 const girls=Boolean(process.env.GIRLS),sports=girls?['5ug']:['flag','8u','6u'];
 const routes=girls?['','#rankings','#rainbow-schedule','#league-schedule?sport=5ug&division=Boxx&team=Rainbow+Unicorns']:['','#advanced','#team-schedules','#league-schedule?sport=8u&division=Pulisic&team=Arsenal'];
 const report=[];
 try{for(const width of [320,390,1400])for(const route of routes){
  const p=await browser.newPage({viewport:{width,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'?capqa='+Date.now()+route);await p.waitForFunction(()=>typeof data!=='undefined'&&data?.ratingMode);
  assert.equal(await p.evaluate(()=>data.ratingMode),'capped');
  assert.equal(await p.locator('#capped').getAttribute('aria-pressed'),'true');
  const publication=await p.evaluate(()=>data);
  if(route.includes('?'))assert.equal(await p.locator(girls?'[data-filter="Results"]':'[data-league-filter="Results"]').getAttribute('aria-pressed'),'true');
  await p.locator('#tab-rankings').click();
  const initialSport=await p.evaluate(()=>typeof sport==='undefined'?'5ug':sport);
  assert.deepEqual(await p.locator('#rows .row').evaluateAll(es=>es.map(e=>[e.dataset.team,e.querySelector('.rank').textContent])),R.compute(publication.divisions,initialSport,'capped').map(t=>[t.team,t.rank?t.rankText:'—']),'Actual untouched fresh-load capped ranks');
  for(const s of sports){
   if(!girls)await p.locator(`[data-sport="${s}"]`).click();
   for(const mode of ['capped','raw']){
    await p.locator('#'+mode).click();
    const expected=R.compute(publication.divisions,s,mode);
    const shown=await p.locator('#rows .row').evaluateAll(es=>es.map(e=>[e.dataset.team,e.querySelector('.rank').textContent,e.querySelector('.diff').textContent]));
    assert.deepEqual(shown,expected.map(t=>[t.team,t.rank?t.rankText:'—',t.power===null?'—':(t.power>0?'+':'')+Number(t.power.toFixed(2))]));
    const consumers=await p.evaluate(s=>SBMSALeagueSchedule.buildRows(data,s).flatMap(r=>[r.away,r.home].map(t=>[r.division,t.team,t.rank,t.power])),s);
    for(const [d,n,rank,power] of consumers){const t=expected.find(t=>t.division===d&&t.team===n);assert.equal(rank,t.rank);assert.equal(power,t.power);}
    if(!route&&width===320&&mode==='capped')report.push({sport:s,favorites:expected.filter(t=>['Arsenal','Buccaneers','Vipers','Rainbow Unicorns'].includes(t.team)).map(t=>({team:t.team,division:t.division,rank:t.rankText,power:t.power}))});
   }
   assert.notDeepEqual(R.compute(publication.divisions,s,'raw').map(t=>t.power),R.compute(publication.divisions,s,'capped').map(t=>t.power),'Actual full-score influence remains available');
  }
  // Selected Raw survives native route navigation, including hidden controls.
  for(const tab of girls?['rainbow-unicorns','rainbow-schedule','league-schedule','rankings']:['advanced','team-schedules','league-schedule','rankings']){
   await p.locator('#tab-'+tab).click();assert.equal(await p.evaluate(()=>data.ratingMode),'raw');
  }
  await p.reload();await p.waitForFunction(()=>typeof data!=='undefined'&&data?.ratingMode==='capped');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
  if(!route&&width<400){await p.locator('#tab-rankings').click();await p.screenshot({path:(process.env.QA_DIR||'/tmp')+`/capped-${girls?'girls':'boys'}-${width}.png`});}
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log(JSON.stringify({freshCappedRoutes:true,actualRanks:true,rawFullScoreEffect:true,navigation:true,widths:[320,390,1400],report},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
