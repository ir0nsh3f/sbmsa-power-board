const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../site');const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0])==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({args:['--no-sandbox']});for(const width of [320,390,1400]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.row');
 assert.match(await page.locator('#publication').innerText(),/1 result unknown/);
 const teams=await page.evaluate(()=>data.divisions.find(d=>d.sport==='6u'&&d.division==='Mbappe').teams.filter(t=>['Bomb Pops','Lightning'].includes(t.team)));const record=t=>`${t.w}–${t.l}–${t.t}`;for(const t of teams){assert.equal(t.unknown_gp,1);assert.equal(t.reported_record.gp,t.gp+1);assert.equal(t.reported_record.l,t.l+1);}const bomb=teams.find(t=>t.team==='Bomb Pops');await page.locator('[data-sport="6u"]').click();await page.locator('#search').fill('Bomb Pops');assert.ok((await page.locator('#rows').innerText()).includes(`Verified game record excludes 1 unknown result; official reported ${record(bomb.reported_record)} / ${bomb.reported_record.gp} GP`));
 await page.locator('#tab-league-schedule').click();await page.locator('#search').fill('Lightning');await page.locator('[data-league-filter="All"]').click();
 const fixture=page.locator('[data-league-fixture]').filter({hasText:'Result unknown — source lists L/L'});assert.equal(await fixture.count(),1);await fixture.locator('summary').click();
 const text=await fixture.innerText();for(const t of teams)assert.ok(text.includes(`Verified game record ${record(t)} (${t.gp} GP); Official reported record ${record(t.reported_record)} (${t.reported_record.gp} GP)`));assert.doesNotMatch(text,/0–0 Final|Model ·/);
 assert.equal(await fixture.locator('a').filter({hasText:'Official schedule'}).getAttribute('href'),'https://sbmsa.net/sites/sbmsa/schedule/742279/');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(process.env.QA_DIR){fs.mkdirSync(process.env.QA_DIR,{recursive:true});await fixture.screenshot({path:path.join(process.env.QA_DIR,`unknown-${width}.png`)});await page.screenshot({path:path.join(process.env.QA_DIR,`warning-${width}.png`)});}
 await page.locator('[data-league-filter="Upcoming"]').click();assert.equal(await fixture.count(),0);await page.locator('[data-league-filter="Results"]').click();assert.equal(await fixture.count(),0);assert.deepEqual(errors,[]);await page.close();
 }console.log('Unknown source warning, verified/reported coverage, All-only unknown, source link and responsive UI passed 320/390/1400');}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
