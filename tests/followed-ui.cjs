const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{for(const width of [320,390,1400]){
 const p=await b.newPage({viewport:{width,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto((process.env.TEST_URL||'http://127.0.0.1:8766/')+'?followed='+Date.now());await p.waitForFunction(()=>typeof data!=='undefined'&&data);
 await p.locator('[data-sport="8u"]').click();
 for(const mode of ['raw','capped']){await p.locator('#tab-rankings').click();await p.locator('#'+mode).click();for(const view of ['rankings','advanced']){
  await p.locator('#tab-'+view).click();const row=p.locator((view==='rankings'?'#rows':'#stats-body')+' [data-team="Celtic"]');
  assert.ok(await row.evaluate(e=>e.classList.contains('favorite')));assert.equal(await row.locator('[aria-label="Followed team"]').count(),1);assert.match(await row.innerText(),/Moore/);assert.match(await row.innerText(),/Messi/);
  assert.ok(await row.evaluate(e=>[...(e.tagName==='TR'?e.children:[e])].every(c=>getComputedStyle(c).backgroundColor==='rgb(244, 231, 223)')));
  if(mode==='raw'&&process.env.QA_DIR){await row.scrollIntoViewIfNeeded();await p.screenshot({path:`${process.env.QA_DIR}/celtic-${view}-${width}.png`});}
 }}
 await p.locator('#tab-league-schedule').click();await p.locator('#search').fill('Celtic');await p.locator('[data-league-filter="All"]').click();
 const expected=await p.evaluate(()=>data.divisions.find(d=>d.sport==='8u'&&d.division==='Messi').schedule.filter(g=>[g.home,g.away].includes('Celtic')).length);
 const rows=p.locator('.league-fixture');assert.equal(await rows.count(),expected);assert.ok(expected>0);
 for(const row of await rows.all()){assert.match(await row.innerText(),/Followed team/);assert.equal(await row.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(243, 225, 213)');await row.locator('summary').click();assert.equal(await row.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(243, 225, 213)');}
 if(process.env.QA_DIR){await rows.first().scrollIntoViewIfNeeded();await p.screenshot({path:`${process.env.QA_DIR}/celtic-schedule-${width}.png`});}
 await p.locator('#search').fill('');await p.locator('[data-sport="6u"]').click();await p.locator('#tab-rankings').click();assert.equal(await p.locator('#rows [data-team="Celtics"].favorite').count(),0);
 await p.locator('#tab-team-schedules').click();assert.deepEqual(await p.locator('[data-schedule-team] option').evaluateAll(es=>es.map(e=>e.value)),['all','flag|Burrow|Buccaneers','8u|Pulisic|Arsenal','6u|Messi|Vipers']);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await p.close();
}console.log('PASS followed UI 320/390/1400: exact identity, Raw/cap Rankings/Advanced, warm full rows and open fixtures, labels, household exclusion, no overflow/JS errors');}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
