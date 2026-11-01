const test=require('node:test'),assert=require('node:assert/strict'),R=require('../site/ratings.js');
const data=require('../site/data.json'),source=require('../site/playoffs.json').sources.find(s=>s.games.some(g=>g.home.name==='Celtics')),game=source.games.find(g=>g.home.name==='Celtics');
// Actual source fixture isolated from future rounds; numeric loss regression is explicit.
const post={sources:[{...source,games:[{...game,home_score:0,away_score:1}]}]};
test('Celtics verified playoff loss is in combined record, without changing regular source',()=>{
 const before=JSON.stringify(data),f=R.fullSeason(data,post),d=f.divisions.find(d=>d.sport==='6u'&&d.division==='Messi'),t=d.teams.find(t=>t.team==='Celtics'),old=data.divisions.find(d=>d.sport==='6u'&&d.division==='Messi').teams.find(t=>t.team==='Celtics');
 assert.equal(t.l,old.l+1);assert.equal(t.gp,old.gp+1);assert.equal(t.scored_gp,(old.scored_gp??old.gp)+1);assert.deepEqual(t.regular_record,{w:old.w,l:old.l,t:old.t,gp:old.gp});assert.equal(JSON.stringify(data),before);
 assert.deepEqual(R.fullSeason(f,post),f);
});
test('paired outcome uses same identity/dedup, counts GP but never scoredGP or power',()=>{
 const p=structuredClone(post),s=p.sources.find(s=>s.games.some(g=>g.home.name==='Celtics')),g=s.games.find(g=>g.home.name==='Celtics');
 g.home_score=g.away_score=null;g.home_outcome='L';g.away_outcome='W';
 s.games.push(structuredClone(g));
 const f=R.fullSeason(data,p),t=f.divisions.find(d=>d.sport==='6u'&&d.division==='Messi').teams.find(t=>t.team==='Celtics'),o=data.divisions.find(d=>d.sport==='6u'&&d.division==='Messi').teams.find(t=>t.team==='Celtics');
 assert.equal(t.l,o.l+1);assert.equal(t.gp,o.gp+1);assert.equal(t.scored_gp,o.scored_gp??o.gp);assert.equal(t.outcome_only_gp,(o.outcome_only_gp||0)+1);
 assert.equal(f.divisions.flatMap(d=>d.power_games).filter(x=>x.id===g.id).length,0);

});
