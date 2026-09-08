# SBMSA Power Board

Independent, public team-level rankings for Fall 2026 SBMSA JV Flag, 8U boys soccer, and 6U boys soccer. Not affiliated with SBMSA.

Website: https://ir0nsh3f.github.io/sbmsa-power-board/

## Updates

GitHub Actions checks the eight official division pages every six hours, at 00:17, 06:17, 12:17 and 18:17 UTC. Scheduled Actions may be delayed by GitHub; this is not a real-time service. A manual check is available under **Actions → Refresh results and publish → Run workflow**, or by asking the household assistant to refresh.

- **Last checked:** latest attempted complete collection.
- **Last successful check:** latest collection accepted after validation.
- **Data updated:** when accepted results/standings last changed; an unchanged successful check does not move this timestamp.
- If any division cannot be verified, the collector keeps the previous complete snapshot and publishes an error status instead of silently mixing old and new divisions. Failed source checks also flag the workflow.
- The page's reload button reads the latest published JSON. It does not trigger a GitHub workflow or scrape SBMSA from the browser.

## Ranking method

Within each sport/age group, rank teams that have played by `(wins + 0.5 × ties) / games played`, then by average per-game scoring margin. The default limits each game's contribution to ±21 points for football or ±3 goals for soccer. The alternative uses the raw per-game average. Equal values retain tied competition ranks; teams with no games remain unrated. Division filters preserve the combined rank.

The per-game method avoids rewarding teams simply for having played more games. It is not a strength-of-schedule model and does not establish equal difficulty across disconnected divisions. All rankings remain provisional. Caps are editorial choices, not league rules. Public official standings and completed-game totals are cross-checked before publishing.

## Scope and privacy

Only public team results, division names, source links, and owner-approved child first-name/team associations are published. No private feeds, player profiles, personal contacts or GitHub credentials are included. Baseball is excluded until the relevant league/results source is identified.

## Run locally

Python 3.12 or newer:

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python scripts/update_results.py
python -m http.server 8000 --directory site
```

Open http://localhost:8000. The server is only needed for local viewing; GitHub hosts the public site even with the household PC off.

## Operations

Only `site/` is uploaded to Pages. The workflow uses GitHub's built-in short-lived `GITHUB_TOKEN` and Pages OIDC, not a personal token. Third-party Actions are pinned to commit hashes. Concurrent deployments are serialized.

Owner: ir0nsh3f. Review the schedule and division IDs at the end of Fall 2026 (November 30) and before each new season. Disable the workflow when no longer wanted. Existing last-good data and the page remain available if scheduled checks stop.
