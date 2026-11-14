# Ringside — boxing fight simulator

Sim any boxing match, past or present, round by round: animated ring, live play-by-play,
CompuBox-style punch stats and three judges' 10-point-must scorecards.

**Corner Mode** puts you in a fighter's corner. Between rounds you see the damage, the gas tank
and the unofficial card, then choose the instructions (go to the body, pressure, box and move,
make them miss, survive, go for the KO, or throw in the towel). The calls genuinely change the fight.

## Run it

Static site, no build step and no dependencies.

```bash
node serve.js
```

Then open http://localhost:5173. Any static host works too (GitHub Pages, Cloudflare Pages, Netlify).

## How it works

| File | What it does |
| --- | --- |
| `js/data.js` | 557 boxers across all 17 divisions, 1900s to today: record, height, reach, stance, style, era and 10 ratings. Edit freely. |
| `SOURCES.md` | Where each researched fighter's record and measurements came from, how current it is, and the corrections made to the original roster. |
| `js/engine.js` | Seeded fight engine. 3-second moments: range battle, combinations, counters, damage/stun, knockdowns and counts, cuts, fatigue, referee/corner/doctor stoppages, judges with different scoring tendencies. Weight classes matter: drained fighters lose stamina and chin, and fighters moving up lose pop and give away size. |
| `js/ring.js` | Canvas renderer: procedurally animated fighters, referee, counts, crowd. |
| `js/app.js` | Matchup builder, playback, Corner Mode, scorecards, 1,000-sim odds. |

Fights are deterministic per seed, so the URL hash (`#a=usyk&b=fury&seed=…`) replays the same fight.
Records are verified to November 2026 for active fighters (see `SOURCES.md`) and are final career records for retired ones. Ratings describe each fighter at their prime; the Form setting's "Current" option ages them from 33 using birth dates in `js/births.js` (Wikidata).
