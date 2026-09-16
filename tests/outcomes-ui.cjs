// Real-publication coverage and final-outcome smoke. No site fixtures injected.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{const root=path.resolve(__dirname,'../site');
 const server=http.createServer((req,res)=>{let p=path.join(root,req.url.split('?')[0]);if(p===root+'/')p+='index.html';if(!p.startsWith(root+'/')||!fs.existsSync(p)){res.writeHead(404).end();return;}res.setHeader('Content-Type',p.endsWith('.json')?'application/json':p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({args:['--no-sandbox']});
 const evidence=[];
 for(const width of [320,390,768,1400]){const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#rows .row');
 const actual=await page.evaluate(()=>data);assert.equal(actual.status,'ok');
 const affected=actual.divisions.flatMap(d=>d.schedule.filter(g=>g.home_outcome).map(g=>({d,g})));
 assert.ok(affected.length,'Expected fresh official outcome-only evidence');
 for(const {d,g} of affected){
 await page.locator(`[data-sport="${d.sport}"]`).click();await page.locator('#division').selectOption(d.division);
 for(const side of ['home','away']){const t=d.teams.find(t=>t.team===g[side]);const row=page.locator('#rows .row').filter({has:page.locator('.team',{hasText:t.team})});
 assert.match(await row.innerText(),/score unavailable/);assert.match(await row.innerText(),new RegExp(`${t.scored_gp} scored / ${t.gp} GP`));
 if(!t.scored_gp){assert.equal(await row.locator('.rank').innerText(),'—');assert.equal(await row.locator('.result').innerText(),'—');assert.equal(await row.locator('.diff').innerText(),'—');}
 }
 await page.getByRole('tab',{name:'Advanced',exact:true}).click();
 for(const side of ['home','away']){const t=d.teams.find(t=>t.team===g[side]);const row=page.locator('#stats-body tr').filter({has:page.locator('strong',{hasText:t.team})});assert.match(await row.innerText(),/score unavailable/);if(!t.scored_gp){const cells=await row.locator('td').allTextContents();assert.equal(cells[6],'—');assert.equal(cells[7],'—');}}
 await page.getByRole('tab',{name:'Schedule',exact:true}).click();await page.locator('[data-league-filter="Results"]').click();
 const fixture=page.locator('.league-fixture').filter({hasText:`${g.away} ${g.away_outcome} – ${g.home} ${g.home_outcome} · score unavailable`});assert.equal(await fixture.count(),1);await fixture.locator('summary').click();assert.match(await fixture.innerText(),/Official W\/L; score unavailable/);assert.doesNotMatch(await fixture.innerText(),/null–null|forfeit/i);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
 if(process.env.QA_DIR){fs.mkdirSync(process.env.QA_DIR,{recursive:true});await fixture.screenshot({path:path.join(process.env.QA_DIR,`outcome-${width}.png`)});}
 evidence.push({width,source:actual.last_successful_check,final:await fixture.locator('.league-score').innerText()});
 await page.getByRole('tab',{name:'Rankings',exact:true}).click();
 }
 // Favorites use the same current Raw ranks, without counting missing scores as draws.
 const favorites=await page.evaluate(()=>['flag','8u','6u'].map(s=>{const name={flag:'Buccaneers','8u':'Arsenal','6u':'Vipers'}[s];const t=SBMSARatings.compute(data.divisions,s,'raw').find(t=>t.team===name);return {sport:s,team:name,rank:t.rankText,gp:t.gp,scored_gp:t.scored_gp??t.gp,record:[t.w,t.l,t.t]};}));
 evidence.push({width,favorites});assert.deepEqual(errors,[]);await page.close();
 }console.log(JSON.stringify(evidence,null,2));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
