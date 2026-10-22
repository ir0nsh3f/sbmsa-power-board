const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
for(const width of [320,390,1400]){const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8765/');await p.waitForSelector('.row');await p.locator('[data-sport="6u"]').click();
assert.match(await p.locator('#publication>strong').innerText(),/6u fresh.*Score gaps/);
await p.locator('#publication-details').evaluate(e=>e.open=true);
const detail=await p.locator('#publication-details').innerText();for(const name of ['Blue Jays','San Jose','Bomb Pops','Lightning'])assert.ok(detail.includes(name));assert.ok(detail.includes('not a played score'));
const evidence=await p.evaluate(()=>{for(const d of data.divisions.filter(d=>d.sport==='6u'))for(const t of d.teams){const scored=d.games.filter(g=>g.home_score!==null&&[g.home,g.away].includes(t.team));if(scored.length!==(t.scored_gp??t.gp))throw Error('scored GP mismatch '+t.team);}return {statuses:data.division_status,warnings:data.warnings,teams:data.divisions.filter(d=>['Haaland','Mbappe'].includes(d.division)).flatMap(d=>d.teams.filter(t=>t.reported_goals))};});
assert.equal(evidence.statuses['6u|Haaland'].status,'ok');assert.equal(evidence.statuses['6u|Mbappe'].status,'ok');assert.equal(evidence.teams.length,4);assert.equal(evidence.warnings.length,5);
await p.locator('#publication-details').evaluate(e=>e.open=false);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
if(process.env.QA_DIR){fs.mkdirSync(process.env.QA_DIR,{recursive:true});await p.screenshot({path:process.env.QA_DIR+`/accounting-${width}.png`});}assert.deepEqual(errors,[]);await p.close();}
console.log('6u fresh, scoped score-gap warnings, four residual audits, scoredGP, responsive 320/390/1400 passed');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
