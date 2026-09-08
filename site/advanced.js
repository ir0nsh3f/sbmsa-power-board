(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SBMSAAdvanced = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Consumes the collector's validated snapshot; never fetches or mutates it.
  // Adjusted margin is an editorial, exploratory model, not an official ranking
  // or calibrated prediction. Disconnected divisions are never cross-calibrated.
  // SOS is a per-meeting mean over known external opponent records; coverage
  // reports the known fraction. Adjusted margin requires complete coverage.
  function compute(divisions, sport) {
    const result = {};
    for (const division of divisions) {
      if (division.sport !== sport) continue;
      const games = division.games.filter(g => Number.isFinite(g.home_score) && Number.isFinite(g.away_score));
      for (const team of division.teams) {
        const meetings = games.filter(g => g.home === team.team || g.away === team.team);
        const close = {w: 0, l: 0, t: 0, gp: 0};
        let shutouts = 0;
        for (const g of meetings) {
          const home = g.home === team.team;
          const scored = home ? g.home_score : g.away_score;
          const allowed = home ? g.away_score : g.home_score;
          if (allowed === 0) shutouts++;
          const margin = scored - allowed;
          if (Math.abs(margin) <= (sport === 'flag' ? 8 : 1)) {
            close.gp++;
            close[margin > 0 ? 'w' : margin < 0 ? 'l' : 't']++;
          }
        }
        const cap = sport === 'flag' ? 21 : 3;
        const capped = margin => Math.max(-cap, Math.min(cap, margin));
        let known = 0, opponentRates = 0, adjustedSum = 0;
        for (const meeting of meetings) {
          const isHome = meeting.home === team.team;
          const opponent = isHome ? meeting.away : meeting.home;
          // Exclude ALL head-to-head meetings, not just this occurrence.
          const external = games.filter(g =>
            (g.home === opponent || g.away === opponent) &&
            g.home !== team.team && g.away !== team.team);
          if (!external.length) continue;
          let wins = 0, ties = 0, marginSum = 0;
          for (const g of external) {
            const margin = g.home === opponent ? g.home_score - g.away_score : g.away_score - g.home_score;
            if (margin > 0) wins++;
            if (margin === 0) ties++;
            marginSum += capped(margin);
          }
          known++;
          opponentRates += (wins + 0.5 * ties) / external.length;
          const focalMargin = isHome ? meeting.home_score - meeting.away_score : meeting.away_score - meeting.home_score;
          // External capped average * n/(n+3), algebraically simplified.
          adjustedSum += capped(focalMargin) + marginSum / (external.length + 3);
        }
        const perGame = value => team.gp > 0 ? value / team.gp : null;
        result[JSON.stringify([division.division, team.team])] = {
          scored_pg: perGame(team.pf), allowed_pg: perGame(team.pa),
          raw_margin: perGame(team.margin_sum), capped_margin: perGame(team.capped_margin_sum),
          sos: known ? opponentRates / known : null,
          sos_coverage: team.gp > 0 ? known / team.gp : 0,
          adjusted_margin: meetings.length > 0 && known === meetings.length ? adjustedSum / meetings.length : null,
          shutouts, shutout_rate: perGame(shutouts),
          close_record: close, points_pg: sport === 'flag' ? null : perGame(3 * team.w + team.t)
        };
      }
    }
    return result;
  }
  return {compute};
}));
