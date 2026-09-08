'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../site/advanced.js');
const key = (division, team) => JSON.stringify([division, team]);
const row = (team, fields = {}) => ({team, coach: '', w: 0, l: 0, t: 0, gp: 0, pf: 0, pa: 0, margin_sum: 0, capped_margin_sum: 0, ...fields});
const compute = (...args) => require(modulePath).compute(...args);
const game = (home, away, home_score, away_score) => ({home, away, home_score, away_score});
function fixture(sport, division, games, idle = []) {
  const teams = new Map(idle.map(name => [name, row(name)]));
  for (const g of games) {
    if (!Number.isFinite(g.home_score) || !Number.isFinite(g.away_score)) continue;
    for (const [name, scored, allowed] of [[g.home, g.home_score, g.away_score], [g.away, g.away_score, g.home_score]]) {
      if (!teams.has(name)) teams.set(name, row(name));
      const t = teams.get(name), margin = scored - allowed, cap = sport === 'flag' ? 21 : 3;
      t.gp++; t.pf += scored; t.pa += allowed; t.margin_sum += margin;
      t.capped_margin_sum += Math.max(-cap, Math.min(cap, margin));
      t[margin > 0 ? 'w' : margin < 0 ? 'l' : 't']++;
    }
  }
  return {sport, division, games, teams: [...teams.values()]};
}
const near = (actual, expected) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('cycle excludes focal games and adds shrunken opponent strength with correct sign', () => {
  const d = fixture('8u', 'Cycle', [game('A', 'B', 10, 0), game('B', 'C', 0, 8), game('C', 'A', 1, 0)]);
  const a = compute([d], '8u')[key('Cycle', 'A')];
  assert.equal(a.sos, 0.5);
  assert.equal(a.sos_coverage, 1);
  // B external margin -3 => -0.75; C external margin +3 => +0.75.
  near(a.adjusted_margin, (3 - 0.75 - 1 + 0.75) / 2);
});

test('counts completed shutouts, zero draws and soccer close results with fractional rates', () => {
  const d = fixture('8u', 'Soccer', [game('A', 'B', 0, 0), game('A', 'C', 2, 1), game('D', 'A', 2, 0), game('A', 'E', null, null), game('A', 'F', 0, null)]);
  const a = compute([d], '8u')[key('Soccer', 'A')];
  assert.equal(a.shutouts, 1);
  near(a.shutout_rate, 1/3);
  assert.deepEqual(a.close_record, {w: 1, l: 0, t: 1, gp: 2});
  near(a.points_pg, 4/3);
  assert.equal(compute([d], '8u')[key('Soccer', 'B')].shutouts, 1);
});

test('exports compute and derives per-game metrics from verified fields, preserving idle nulls', () => {
  assert.ok(fs.existsSync(modulePath), 'advanced module must exist');
  const divisions = [{sport: 'flag', division: 'One', games: [], teams: [row('A', {w: 1, l: 1, gp: 2, pf: 48, pa: 16, margin_sum: 32, capped_margin_sum: 20}), row('Idle')]}];
  const result = compute(divisions, 'flag');
  const a = result[key('One', 'A')];
  assert.equal(a.scored_pg, 24);
  assert.equal(a.allowed_pg, 8);
  assert.equal(a.raw_margin, 16);
  assert.equal(a.capped_margin, 10);
  assert.equal(a.points_pg, null);
  assert.deepEqual(result[key('One', 'Idle')], {scored_pg: null, allowed_pg: null, raw_margin: null, capped_margin: null, sos: null, sos_coverage: 0, adjusted_margin: null, shutouts: 0, shutout_rate: null, close_record: {w: 0, l: 0, t: 0, gp: 0}, points_pg: null});
  assert.deepEqual(compute(divisions, '8u'), {});
});


test('repeated meetings weight SOS per meeting and exclude every focal rematch', () => {
  const d = fixture('6u', 'Repeat', [game('A', 'B', 10, 0), game('B', 'A', 0, 2), game('C', 'A', 1, 0), game('B', 'C', 1, 0)]);
  const a = compute([d], '6u')[key('Repeat', 'A')];
  near(a.sos, 2/3);
  assert.equal(a.sos_coverage, 1);
  near(a.adjusted_margin, 1.4166666666666667);
  const only = fixture('6u', 'Only', [game('A', 'B', 2, 0), game('B', 'A', 1, 0)]);
  const result = compute([only], '6u')[key('Only', 'A')];
  assert.equal(result.sos, null);
  assert.equal(result.sos_coverage, 0);
  assert.equal(result.adjusted_margin, null);
});

test('partial SOS uses available meetings but withholds adjusted margin', () => {
  const d = fixture('8u', 'Partial', [game('A', 'B', 1, 0), game('A', 'C', 0, 1), game('B', 'D', 0, 0)]);
  const a = compute([d], '8u')[key('Partial', 'A')];
  assert.equal(a.sos, 0.5);
  assert.equal(a.sos_coverage, 0.5);
  assert.equal(a.adjusted_margin, null);
  assert.deepEqual(a.close_record, {w: 1, l: 1, t: 0, gp: 2});
});

test('external sample shrinkage uses all external games including draws', () => {
  const d = fixture('6u', 'Shrink', [game('A', 'B', 1, 0), game('B', 'C', 2, 0), game('B', 'D', 0, 0)]);
  const a = compute([d], '6u')[key('Shrink', 'A')];
  assert.equal(a.sos, 0.75);
  near(a.adjusted_margin, 1.4); // 1 + ((2+0)/2)*2/(2+3)
});

test('football caps both focal and external games at 21 with signed adjustments', () => {
  const d = fixture('flag', 'Caps', [game('A', 'B', 100, 0), game('B', 'C', 100, 0)]);
  const result = compute([d], 'flag');
  assert.equal(result[key('Caps', 'A')].adjusted_margin, 26.25);
  assert.equal(result[key('Caps', 'C')].adjusted_margin, -26.25);
  assert.equal(result[key('Caps', 'A')].raw_margin, 100);
  assert.equal(result[key('Caps', 'A')].capped_margin, 21);
});

test('football close threshold includes eight but excludes nine for wins and losses', () => {
  const d = fixture('flag', 'Close', [game('A', 'B', 8, 0), game('C', 'A', 8, 0), game('A', 'D', 0, 0), game('A', 'E', 9, 0), game('F', 'A', 9, 0)]);
  const a = compute([d], 'flag')[key('Close', 'A')];
  assert.deepEqual(a.close_record, {w: 1, l: 1, t: 1, gp: 3});
  assert.equal(a.shutouts, 3);
  assert.equal(a.shutout_rate, 0.6);
  assert.equal(a.points_pg, null);
});

test('identical team names remain division-local and sport-filtered without input mutations', () => {
  const one = fixture('8u', 'One', [game('A', 'B', 1, 0)]);
  const two = fixture('8u', 'Two', [game('B', 'C', 3, 0)], ['A']);
  const otherSport = fixture('flag', 'One', [game('A', 'B', 21, 0)]);
  const divisions = [one, two, otherSport];
  const before = JSON.stringify(divisions);
  function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } }
  freeze(divisions);
  const result = compute(divisions, '8u');
  assert.equal(Object.keys(result).length, 5);
  assert.equal(result[key('One', 'A')].sos, null);
  assert.equal(result[key('One', 'A')].raw_margin, 1);
  assert.equal(result[key('Two', 'A')].raw_margin, null);
  assert.equal(result[key('Two', 'B')].raw_margin, 3);
  assert.equal(JSON.stringify(divisions), before);
  assert.deepEqual(compute(divisions, '8u'), result);
});

test('browser UMD exports SBMSAAdvanced without dependencies', () => {
  const vm = require('node:vm');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context);
  assert.equal(typeof context.SBMSAAdvanced.compute, 'function');
  assert.equal(JSON.stringify(context.SBMSAAdvanced.compute([], 'flag')), '{}');
});
