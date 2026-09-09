const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const server=http.createServer((req,res)=>{const name=path.basename(req.url.split('?')[0])||'index.html';const file=path.join(__dirname,'../site',name);if(!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.row');
  assert.equal(await page.locator('#tab-league-schedule').count(),1,'League Schedule tab exists');
  await page.locator('#tab-league-schedule').click();assert.equal(await page.locator('[data-league-filter="Upcoming"]').getAttribute('aria-pressed'),'true');
  await page.locator('#tab-league-schedule').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator(':focus').getAttribute('id'),'tab-rankings','Last tab wraps to first, not body');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator(':focus').getAttribute('id'),'tab-league-schedule');
  // Independently derive exact favorites from each fixture's source identity.
 async function checkFavoriteFill(){
  const checks=await page.locator('[data-league-fixture]').evaluateAll(es=>es.map(el=>{
   const [sport,division,index]=JSON.parse(el.dataset.leagueFixture);
   const game=data.divisions.find(d=>d.sport===sport&&d.division===division).schedule[index];
   const favorite={flag:['Burrow','Buccaneers'],'8u':['Pulisic','Arsenal'],'6u':['Messi','Vipers']}[sport];
   const expected=division===favorite[0]&&[game.home,game.away].includes(favorite[1]);
   const fill=getComputedStyle(el).backgroundColor;
   const transparent=c=>c==='rgba(0, 0, 0, 0)'||c==='transparent';
   const bg=node=>{while(node){const c=getComputedStyle(node).backgroundColor;if(!transparent(c))return c;node=node.parentElement;}};
   const summary=el.querySelector('summary');
   const closed=bg(summary);el.open=true;const opened=bg(summary),detail=bg(el.querySelector('.league-detail'));el.open=false;
   const luminance=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
   const contrasts=[...el.querySelectorAll('b,small,.league-time,.league-meta,.league-rank,a,.league-detail p')].map(n=>{const a=luminance(getComputedStyle(n).color),b=luminance(bg(n));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
   return {expected,marked:el.classList.contains('league-fixture-ours'),label:!!el.querySelector('.league-ours'),filled:!transparent(fill),different:fill!==bg(el.parentElement),whole:closed===fill&&opened===fill&&detail===fill,minContrast:Math.min(...contrasts)};
  }));
  for(const c of checks){assert.equal(c.marked,c.expected);assert.equal(c.label,c.expected);assert.equal(c.filled,c.expected);if(c.expected){assert.ok(c.different&&c.whole,'Entire closed/open favorite block is distinctly filled');assert.ok(c.minContrast>=4.5,`Favorite text contrast ${c.minContrast}`);}}
 }
 const counts={};
  for(const width of [320,390,768,1400]){
   await page.setViewportSize({width,height:1000});
   for(const sport of ['flag','8u','6u']){
    await page.locator(`[data-sport="${sport}"]`).click();
    const divisions=await page.locator('#division option').evaluateAll(es=>es.map(e=>e.value));
    for(const division of divisions)for(const filter of ['Upcoming','Results','All']){
     await page.locator('#division').selectOption(division);await page.locator(`[data-league-filter="${filter}"]`).click();
     const expected=await page.evaluate(({sport,division,filter})=>{
      const today=SBMSASchedules.chicagoDate(new Date());return data.divisions.filter(d=>d.sport===sport&&(division==='all'||d.division===division)).flatMap(d=>d.schedule).filter(g=>{const done=[g.away_score,g.home_score].every(x=>Number.isInteger(x)&&x>=0);const date=g.start_iso?SBMSASchedules.chicagoDate(new Date(g.start_iso)):g.date_iso;return filter==='All'||(filter==='Results'?done:!done&&(!date||date>=today));}).length;
     },{sport,division,filter});
     assert.equal(await page.locator('[data-league-fixture]').count(),expected,`${width}/${sport}/${division}/${filter}`);counts[`${sport}/${division}/${filter}`]=expected;await checkFavoriteFill();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
     assert.ok(await page.locator('#league-schedule').evaluate(e=>e.scrollWidth<=e.clientWidth),'No schedule overflow');
    }
    await page.locator('#division').selectOption('all');await page.locator('[data-league-filter="All"]').click();
    const coach=await page.evaluate(sport=>data.divisions.find(d=>d.sport===sport).teams[0].coach,sport);await page.locator('#search').fill(coach);
    const coachCount=await page.evaluate(({sport,coach})=>data.divisions.filter(d=>d.sport===sport).reduce((n,d)=>n+d.schedule.filter(g=>d.teams.some(t=>[g.away,g.home].includes(t.team)&&(t.team+' '+t.coach).toLowerCase().includes(coach.toLowerCase()))).length,0),{sport,coach});
    assert.equal(await page.locator('[data-league-fixture]').count(),coachCount);await checkFavoriteFill();await page.locator('#search').fill('');
    const ranks=await page.evaluate(()=>{const saved={sport,mode};const checks=[];for(const r of SBMSALeagueSchedule.buildRows(data,sport)){mode='capped';for(const t of [r.away,r.home]){const expected=rankings().find(x=>x.team===t.team&&x.division===r.division);checks.push([t.rankText,expected.gp?expected.rankText:'Unrated']);}}Object.assign(window,{});mode=saved.mode;return checks;});
    for(const [actual,expected] of ranks)assert.equal(actual,expected);
    await page.locator('[data-league-filter="Upcoming"]').click();
    const first=page.locator('.league-fixture').first();if(await first.count()){await first.locator('summary').click();assert.ok(await first.locator('.league-detail').isVisible());assert.match(await first.innerText(),/Coach:/);await first.locator('summary').click();}
    await page.locator('[data-league-watch]').click();assert.equal(await page.locator('[data-league-fixture]').count(),await page.evaluate(()=>SBMSALeagueSchedule.filterRows(SBMSALeagueSchedule.buildRows(data,sport),{watchlist:true}).length));await page.locator('[data-league-watch]').click();
    assert.ok(await page.locator('#league-schedule button,#league-schedule summary,#shared-filters input,#shared-filters select').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).every(e=>e.getBoundingClientRect().height>=44)));
    assert.ok(await page.locator('button:visible').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth)));
    if(process.env.QA_DIR){await page.evaluate(()=>{const favorite=document.querySelector('.league-fixture-ours');scrollTo(0,favorite?favorite.getBoundingClientRect().top+scrollY-innerHeight/2:0);});await page.screenshot({path:path.join(process.env.QA_DIR,`league-${sport}-${width}.png`)});}
   }
  }
  // Raw rankings and restrictive filters cannot change schedule's capped ranks.
  await page.locator('#tab-rankings').click();await page.locator('#raw').click();await page.locator('#tab-league-schedule').click();
  assert.equal(await page.locator('#raw').isVisible(),false);
  for(const sport of ['flag','8u','6u']){await page.locator(`[data-sport="${sport}"]`).click();for(const filter of ['Upcoming','Results','All']){await page.locator(`[data-league-filter="${filter}"]`).click();await checkFavoriteFill();}}
  await page.evaluate(()=>location.hash='league-schedule');await page.reload();await page.waitForSelector('[data-league-fixture]');assert.ok(await page.locator('#league-schedule').isVisible());
  // QA-only eligible records; never persisted or published as real results.
  await page.evaluate(()=>{window.originalLeagueData=data;data={...data,divisions:[{sport:'flag',division:'Burrow',url:'https://example.org',teams:[{team:'Buccaneers',coach:'Wells',gp:3,w:3,l:0,t:0,pf:30,pa:0,margin_sum:30,capped_margin_sum:30},{team:'Bears',coach:'Test coach',gp:3,w:3,l:0,t:0,pf:30,pa:0,margin_sum:30,capped_margin_sum:30}],games:[],schedule:[{away:'Bears',home:'Buccaneers',date_iso:'2099-09-10',location:'QA only'}]}]};sport='flag';resetDivision();render();});
  for(const width of [320,390,768,1400]){
   await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.league-badge').innerText(),'Top matchup');await checkFavoriteFill();await page.locator('[data-league-watch]').click();await checkFavoriteFill();assert.equal(await page.locator('.league-badge').innerText(),'Top matchup');await page.locator('[data-league-watch]').click();
   await page.locator('.league-fixture summary').click();assert.match(await page.locator('.league-detail').innerText(),/top 1 of 2/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.league-fixture summary').click();
  }
  await page.evaluate(()=>{data=window.originalLeagueData;resetDivision();render();});
  assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify({status:'PASS',counts,errors},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
