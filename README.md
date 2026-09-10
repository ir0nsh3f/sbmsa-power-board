# SBMSA Power Board

Independent, public team-level rankings for Fall 2026 SBMSA JV Flag, 8U boys soccer, and 6U boys soccer. Not affiliated with SBMSA.

Website: https://ir0nsh3f.github.io/sbmsa-power-board/

## Updates

GitHub Actions checks the eight official division pages every six hours, at 00:17, 06:17, 12:17 and 18:17 UTC. Scheduled Actions may be delayed by GitHub; this is not a real-time service. A manual check is available under **Actions → Refresh results and publish → Run workflow**, or by asking the household assistant to refresh.

- **Last checked:** latest attempted complete collection.
- **Last successful check:** latest collection accepted after validation.
- **Data updated:** when accepted results/standings last changed; an unchanged successful check does not move this timestamp.
- If any division cannot be verified, the collector keeps the previous complete snapshot and publishes an error status instead of silently mixing old and new divisions. Failed source checks also flag the workflow.
- Opening or refreshing the page reads the latest published JSON. There is no extra reload button, and the browser does not trigger a source check.

## Observed season history

`history/index.json` links immutable `history/fall-2026/<UTC timestamp>-<result hash>.json` captures. Each accepted eight-division check records a capture only when normalized **result data** differs from the latest capture. Identical checks, row reordering, coach edits, field changes and unplayed schedule changes do not add points. New results, completed-game date/time corrections, record/score corrections and reversions do. The first capture is a baseline observed now, not fabricated opening-day history.

Every capture preserves public sport/division/source identity, W/L/T/GP, scoring totals, per-game-capped margin totals and every completed game's final score and source date/time (including normalized dates/offsets when available). `captured_at` is the UTC observation/check time, **not** a game's date or the unknown time SBMSA posted its score. Captures are cumulative observations: never sum games across captures. Use the latest captured version of a game when analyzing corrected results. Undated games cannot reliably enter dated recent-form windows.

The compact index contains per-capture team points keyed by `[season, sport, division, team]`, records/scoring totals, capped average margin, win rate and competition rank/tie flags. Ranks use the versioned default method (±21 flag / ±3 soccer, sport/age comparisons, unplayed unrated). Equal rank does not imply equal division strength. Future charts can select the last observation at/before each weekly boundary; weeks before the baseline are unknown, not zero. Recent form should be calculated from dated completed games, separately from movement in these cumulative ranks. There is deliberately no trend chart with only one observation.

Only fully reconciled collections enter history. Files are flushed before atomic publication; capture creation cannot overwrite an existing file. A failed index write removes only that attempt's new capture, retaining the prior index and snapshots. History commits before the current dashboard file: an interruption after archive acceptance can leave the dashboard behind; an unchanged retry publishes the accepted results without another capture. An interruption between capture creation and index publication leaves an unindexed file; validation fails closed for deliberate repair rather than deleting it or silently resetting history. Missing/corrupt archives also block publication. Run only one local collector at a time; GitHub checks/deployments are serialized and fetch current `main` before collection.

The scheduled workflow validates the archive and its agreement with current results, commits **both** `site/data.json` and `site/history/`, and uploads them together. No automatic retention/deletion: review after **2026-11-30** and before season or ranking-method rollover, retaining the Fall 2026 archive. History intentionally omits private feeds, contacts, player profiles, owner associations and ancillary coach/location metadata.

## Experimental JV Flag projections (review 2026-11-30)

The League Schedule-only **Experimental projections** toggle is OFF on page load and absent for soccer. It adds whole-point home-perspective margin, combined total and broad approximate 95% model-based ranges with both training GP counts and “Experimental · very small sample.” It never changes rankings, Watchlist, fixture chronology, maps or favorite-row fill. Full formulas, defaults and provenance: [projection-method.html](https://ir0nsh3f.github.io/sbmsa-power-board/projection-method.html).

`scripts/projections.py` fits each division separately with deterministic standard-library Huber/ridge offense + opponent-defense scoring: 21-point baseline prior weighted 12 observations, zero team effects weighted 6 each, Huber residual threshold 14, residual SD floor 14 plus approximate ridge parameter uncertainty, expected team score guardrail 0–70. No home advantage or cross-division calibration. These defaults are assumptions, not validated calibration; no backtest claim. Unknown kickoff/results and divisions without dated completed games are withheld. Training uses only known-start completed scores before accepted collection; eligible unplayed kickoff must be strictly after collection +30 minutes. Already-started same-day games never get a new forecast.

`site/projections/current.json` is separate from append-only `site/projections/index.json` and immutable `captures/<full-sha256>.json`. Each capture preserves model/config, training scores/hash/cutoff, generation time and exact season/sport/division/home/away/start identity. Unchanged reruns reuse the capture; corrections/reversions append, never rewrite. Capture time is not exact publication time. After Pages deploy, the workflow fetches exact public bytes and commits immutable `publication/<capture-sha256>.json` observations; these receipts become public on the next deployment. Only the first **observed-public before kickoff** forecast can be evaluated. Nothing is backdated or retrospectively refitted as a pregame forecast.

Workflow serializes collection, validates both archives/current-data agreement and stages `site/data.json`, `site/history/` and `site/projections/`. Corruption fails closed; never delete history to bypass validation. Current-output failures can be repaired by rerun without capture duplication. Receipt failures fail the workflow after deployment, never invent an observation. Review after **2026-11-30**, retain all captures across future model changes.

Commands: `python scripts/projection_publication.py validate` and `python scripts/projection_publication.py evaluate` (stored eligible forecasts only; empty is honest). Run full Python/Node suites plus `tests/projections-ui.cjs`, `tests/league-ui.cjs`, `tests/ui-smoke.cjs`, `tests/mobile-smoke.cjs` at 320/390/768/1400 with real collected data; never put synthetic QA forecasts in site/.

## Ranking method

Within each sport/age group, rank teams that have played by `(wins + 0.5 × ties) / games played`, then by average per-game scoring margin. The default limits each game's contribution to ±21 points for football or ±3 goals for soccer. The alternative uses the raw per-game average. Equal values retain tied competition ranks; teams with no games remain unrated. Division filters preserve the combined rank.

The per-game method avoids rewarding teams simply for having played more games. It is not a strength-of-schedule model and does not establish equal difficulty across disconnected divisions. All rankings remain provisional. Caps are editorial choices, not league rules. Public official standings and completed-game totals are cross-checked before publishing.

## Advanced stats and opponent guide

The advanced table follows the selected sport and team/coach/division filters; its comparison sort does not replace the main board ranks. Scoring and defense use points/game for flag, goals/game for soccer. Raw and per-game capped margins are both shown. Soccer includes clean sheets and comparison points/game (3 per win, 1 per tie); flag includes shutouts and one-score records (final margin ≤8 points).

SOS averages opponents' win rates after removing **all** head-to-head meetings with the focal team. Each meeting receives equal weight; coverage identifies missing opponent history. The experimental adjusted margin averages each capped game margin plus that opponent's external capped margin/game, shrunk by `n/(n+3)` for `n` external games. It is withheld unless all opponents have external history. The three-game prior is editorial, not fitted, and this is not a calibrated prediction. No cross-division strength adjustment is made for disconnected schedules. Under three games is explicitly labeled a very small sample. No xG, EPA, or expected-win probabilities are invented from final scores.

The Our Teams schedule uses only current public SBMSA fixtures for Buccaneers/Burrow, Arsenal/Pulisic and Vipers/Messi. It includes upcoming games, completed results, home/away, official field labels, and opponents' latest records/scoring/coaches. These opponent summaries are **current season totals**, not historical pre-game estimates. Times use America/Chicago. Undated/TBD games remain explicitly unresolved; private practices, calendar feeds, personal arrival instructions and unverified stream links are excluded. Historical spring baseball emails informed the layout, not the current data.

## League Schedule (review 2026-11-30)

The **Schedule** tab uses the same JV Flag / 8U / 6U league buttons, division selector and team/official-coach search. It includes every official fixture in the eight collected divisions, grouped chronologically by Central date; completed scores are **away–home**. Default is the complete Upcoming list, not a highlight-only feed. Results shows only two valid final scores; All also shows past games awaiting results. Unscored same-day games remain upcoming; unknown dates sort last and unknown times first within a date. Original source maps are preserved. Expand a row for both coaches, GP, sample status, badge reason and official source. Our team markers use exact sport/division/team identities. Division filtering can focus on our team's actual divisional opponents without implying playoff relevance.

`site/league-schedule.js` is a pure UMD model plus scoped renderer; `league-schedule.css` is scoped to the new view. It reuses schedule date, escaping and safe-URL helpers. Ranks always use **capped full sport/age competition ranks**, independent of Raw mode or filters; ties use the same 1e-9 tolerance as Rankings. Unplayed teams are unrated. Records/ranks are current totals, never reconstructed historical pregame stats.

Highlights are deliberately descriptive, not forecasts or simulated playoff/tiebreak stakes:
- Eligibility: a dated upcoming fixture; both teams rated and **at least 3 GP each**. Completed, past-unscored, undated and small-sample games cannot earn badges.
- **Top matchup** takes priority: both capped competition ranks ≤ `ceil(N/4)`, where N is all rated teams in this sport/age, including rated 1–2 GP teams. Ties at the cutoff are included, potentially expanding the qualifying set beyond a quarter. GP 1–2 teams count in N but cannot themselves earn a badge.
- Otherwise **Close records**: same division and absolute win-rate gap ≤0.15 (15 percentage points; floating-point comparison tolerance 1e-12). Win rate is `(W + 0.5*T)/GP`. This does not predict a close game.
- **Watchlist** is optional and includes only those upcoming highlights, still chronological. It can honestly be empty; there are no forced badges, hot streaks or fabricated stakes.

`node --test tests/league-schedule.test.cjs` verifies thresholds, ties, unrated/small samples, priority, date/status handling, escaping and complete eight-division counts using a frozen real September 9 source baseline (112 flag, 81 8U, 198 6U; 13 completed). The frozen fixture is test-only so future results cannot break the baseline assertions. `node tests/league-ui.cjs` independently reconciles live rendered counts against the current source data at 320/390/768/1400, all league/division/status filters, coach search, capped ranks, Watchlist, disclosure, keyboard wrap, hash entry and 44px controls. Set `QA_DIR` for screenshots and `TEST_URL` for public readback. Version all schedule UI assets when changed. Preserve the sparse real history; no new observations are fabricated.

## Mobile layout

The dashboard has separate keyboard-accessible **Rankings**, **Advanced**, **Our Teams**, and **Schedule** views at every width. Rankings and Advanced share always-accessible sport/division/team-or-coach filters. Advanced sorts by raw differential TOTAL, raw differential /game, best offense, best defense, adjusted margin, SOS or board rank. Selected-metric competition ranks (ties share rank; missing/unplayed last) and values appear beside team identity; the original board rank is separately labeled. Metric ranks describe the filtered comparison. Compact rows keep primary figures at least 12px, metadata 11px and controls 44px tall. Wide tables scroll within their container. Publication details collapse on mobile, but source errors remain visible. Hash links reveal the correct panel; printing reveals all panels. `node tests/mobile-smoke.cjs` checks real-publication density, separate views, disclosures, coach search, touch targets and overflow; `node tests/ui-smoke.cjs` verifies all seven sort orders and browser-only tie/null edge cases. Both support `TEST_URL`.

## Scope and privacy

Only public team results, official coach names, division names, source links, and owner-approved child first-name/team associations are published. No private feeds, player profiles, personal contacts or GitHub credentials are included. Baseball is excluded until the relevant league/results source is identified.

## Run locally

Python 3.12 or newer and Node.js 22:

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node --test tests/*.test.cjs
python scripts/update_results.py
python -m http.server 8000 --directory site
```

Open http://localhost:8000. The server is only needed for local viewing; GitHub hosts the public site even with the household PC off.

## Browser regression checks

With Playwright and its Chromium browser installed, run `node tests/ui-smoke.cjs`. Set `PLAYWRIGHT_MODULE` to a module path for an external installation; set `TEST_URL` to verify the deployed site. The test serves local publication files over loopback by default and checks coach identification/search, button removal, responsive layouts and escaping. QA mutations stay in browser memory.

## Operations

Only `site/` is uploaded to Pages. The workflow uses GitHub's built-in short-lived `GITHUB_TOKEN` and Pages OIDC, not a personal token. Third-party Actions are pinned to commit hashes. Concurrent deployments are serialized.

Owner: ir0nsh3f. Review the schedule and division IDs at the end of Fall 2026 (November 30) and before each new season. Disable the workflow when no longer wanted. Existing last-good data and the page remain available if scheduled checks stop.
