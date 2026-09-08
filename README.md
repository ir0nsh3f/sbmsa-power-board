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

## Ranking method

Within each sport/age group, rank teams that have played by `(wins + 0.5 × ties) / games played`, then by average per-game scoring margin. The default limits each game's contribution to ±21 points for football or ±3 goals for soccer. The alternative uses the raw per-game average. Equal values retain tied competition ranks; teams with no games remain unrated. Division filters preserve the combined rank.

The per-game method avoids rewarding teams simply for having played more games. It is not a strength-of-schedule model and does not establish equal difficulty across disconnected divisions. All rankings remain provisional. Caps are editorial choices, not league rules. Public official standings and completed-game totals are cross-checked before publishing.

## Advanced stats and opponent guide

The advanced table follows the selected sport and team/coach/division filters; its comparison sort does not replace the main board ranks. Scoring and defense use points/game for flag, goals/game for soccer. Raw and per-game capped margins are both shown. Soccer includes clean sheets and comparison points/game (3 per win, 1 per tie); flag includes shutouts and one-score records (final margin ≤8 points).

SOS averages opponents' win rates after removing **all** head-to-head meetings with the focal team. Each meeting receives equal weight; coverage identifies missing opponent history. The experimental adjusted margin averages each capped game margin plus that opponent's external capped margin/game, shrunk by `n/(n+3)` for `n` external games. It is withheld unless all opponents have external history. The three-game prior is editorial, not fitted, and this is not a calibrated prediction. No cross-division strength adjustment is made for disconnected schedules. Under three games is explicitly labeled a very small sample. No xG, EPA, or expected-win probabilities are invented from final scores.

The Our Teams schedule uses only current public SBMSA fixtures for Buccaneers/Burrow, Arsenal/Pulisic and Vipers/Messi. It includes upcoming games, completed results, home/away, official field labels, and opponents' latest records/scoring/coaches. These opponent summaries are **current season totals**, not historical pre-game estimates. Times use America/Chicago. Undated/TBD games remain explicitly unresolved; private practices, calendar feeds, personal arrival instructions and unverified stream links are excluded. Historical spring baseball emails informed the layout, not the current data.

## Mobile layout

The dashboard stays one continuous page on phones: rankings, schedules and advanced statistics are not separate views. Compact table spacing, aligned numeric columns and visible coach identities take priority over large cards. Wide comparison tables scroll inside their own containers rather than widening the page. Keep data readable and interactive controls at least 44px tall. `node tests/mobile-smoke.cjs` checks mobile density, section visibility, coach search and overflow; it also supports `TEST_URL` for deployment verification.

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
