const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
 const base=process.env.TEST_URL||'http://127.0.0.1:8765/',girls=process.env.GIRLS_URL||'http://127.0.0.1:8766/';
 for(const width of [320,390,1400]){
  const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.waitForSelector('.row');
  assert.match(await p.locator('#publication>strong').innerText(),/Partial.*flag fresh/);
  for(const view of ['rankings','advanced','league-schedule']){
   await p.locator('#tab-'+view).click();await p.locator('[data-sport="6u"]').click();
   assert.match(await p.locator('#publication>strong').innerText(),/Haaland.*Mbappe stale.*mixed freshness/);
   assert.equal(await p.evaluate(()=>SBMSAFreshness.sourceTime(data,'6u')),null);
   await p.locator('[data-sport="8u"]').click();assert.match(await p.locator('#publication>strong').innerText(),/8u fresh/);
  }
  await p.locator('[data-sport="6u"]').click();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const dir=process.env.QA_DIR||'/tmp';await p.screenshot({path:dir+'/partial-'+width+'.png'});
  await p.locator('#publication-details summary').click();const detail=await p.locator('#publication-details').innerText();
  assert.match(detail,/ST[A]LE \/ retained/);assert.match(detail,/Cannot reconcile goals for Blue Jays/);assert.match(detail,/Cannot reconcile goals for Bomb Pops/);
  assert.ok(!await p.evaluate(()=>data.soccerAgeProjections?.['6u']));
  await p.goto(girls);await p.waitForSelector('#rows .row',{state:'attached'});assert.equal(await p.locator('#rows .row').count(),24);
  assert.match(await p.locator('#publication>strong').innerText(),/^Source check OK$/);
  const g=await p.evaluate(()=>({d:data.last_successful_check,p:data.soccerProjections.generated_at,status:data.status}));assert.equal(g.d,g.p);assert.equal(g.status,'ok');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:dir+'/partial-girls-'+width+'.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,status:'PASS',girls:g}));await p.close();
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
