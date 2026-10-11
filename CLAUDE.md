# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No framework, no linter, no typecheck. Only dependency is `esbuild` (devDependency), used by the build and the simulator.

```bash
npm install                      # once, needed for build and tools/*.mjs
node build.mjs                   # production bundle -> dist/game.js (+ .map), minified
node build.mjs --dev             # same, unminified
npm run watch                    # rebuild on change
node tools/serve.mjs 8123        # static server at http://localhost:8123 (also .claude/launch.json "tokc")
```

**`index.html` loads `dist/game.js`, not `src/`.** Any change under `src/` needs `node build.mjs` before it shows in the browser. `dist/` is checked in and is what the game ships with. The bundle is an IIFE so the game also runs from `file://`; keep it free of runtime ES modules.

### Testing

There is no unit-test runner. Verification is the headless simulator, which plays AI-only games and checks engine invariants and replay determinism:

```bash
node tools/simulate.mjs 300                          # fuzz with random AI: invariants + replay
node tools/simulate.mjs 1 <seed>                     # one game with a given seed (debugging a crash)
node tools/simulate.mjs 800 1 --levels=hard,normal,easy,random --nocheck --noreplay
                                                     # AI strength matchup (see below)
node tools/dbg.mjs <seed> [players]                  # run one seed and print details
```

Flags: `--adv` (Advanced setup), `--players=N`, `--short`, `--verbose`, `--nocheck`, `--noreplay`, `--profile`. Positional args are `[games] [startSeed]`.

Run the fuzz after any engine or AI edit. Run the matchup after any AI edit: with 4 players the expected ordering is hard > normal > easy > random (about 45 / 37 / 17 / 1 % wins). Any change that breaks this ordering is a regression.

Other checks:

```bash
node tools/i18n_check.mjs        # every UI/engine key exists in both vi and en
node tools/purposes.mjs 60       # shape of every request purpose seen in random games
node tools/coverage.mjs 200 random   # request purposes / log events never reached in simulation
```

`make_assets.py` (needs the raw Tabletop Simulator image dump, not in this repo), `make_map.py` and `make_regions.py` regenerate `assets/`; they are run from the repo root.

## Architecture

The big picture is a **rules engine written as a generator**, driven by a controller, with a UI and an AI that both answer the same requests.

### 1. Engine: the game is a generator (`src/engine/`)

- `Game.run()` (in `flow.js`) is the whole game as one generator: setup, then per Round `startOfYear` → `springPhase` → `summerPhase` (Clash of the 3 Regions) → `autumnPhase` → `winterPhase`, and finally `scoreEnd`.
- When a rule needs a decision, the generator `yield`s a request. The helpers in `game.js` (`select`, `chooseCard`, `chooseRegion`, `yesNo`, `assign`, `distribute`, `peek`) build those requests. Engine code always calls them as `yield*`.
- `Game` is a base class extended via `Object.assign(Game.prototype, {...})` in each module (`view`, `ops_kc`, `ops_council`, `ops_misc`, `actions`, `clash`, `spring`, `flow`, `setup`). `engine/index.js` imports them all. **A new engine module has to be imported there** or its methods do not exist.
- State lives in `S` (`S.players`, `S.cards`, `S.z`, `S.region`, `S.road`, `S.clash`, ...). Cards are plain objects in `S.cards` addressed by `uid`. Zones are arrays in `S.z`, keyed by `game.zk` (e.g. `p0:hand`, `R1:active`, `C:relics`, `o0.2`). Move cards only through `put` / `toHand` / `toDiscard` / `toLost` / `burn`, which keep `card.z` in sync with the zone. `checkInvariants` (`debug.js`) asserts that.
- Randomness only comes from `game.rng` (seeded). Determinism is a hard requirement: the same seed plus the same answers must reproduce the game.

### 2. Controller: `Session` (`src/engine/controller.js`)

- `Session` wraps one `Game` generator and records every answer in `responses` (each flagged `h` = human or AI).
- **Save / load / undo / replay are all the same mechanism**: a save is `{settings, seed, responses}`, and loading or undoing rebuilds the game from scratch by feeding the recorded answers back in. `undo()` truncates `responses` to just before the last human answer and replays. Anything that is not deterministic breaks saves and undo silently.
- `validateAnswer` checks an answer against its request; `respond()` is the human path, `stepAI()` the AI path. A bad AI answer falls back to `fallbackAnswer`.

### 3. Rules logic is split between data and behaviour

- `src/data/` holds static tables: Faction cards (`cards.js`), Kingdom Cards (`kingdom.js`), Tactics and Kingdom's Favour (`tactics.js`), constants and Locations (`constants.js`).
- Behaviour is in `src/engine/logic/`, keyed by `def.key` (Kingdom Cards), `def.logic` (Faction cards), or tactic/KF ids. The shape of each logic object is documented in the header comment of `faction.js`, `kingdom.js` and `tactics.js`. Read those headers before adding an effect.
- `view.js` computes the *effective* state of a card (`logicIds`, `blankMode`, `baseDef`, granted modifiers). Anything that asks "what does this card do right now" should go through view, not read `def` directly.
- Clash resolution (`clash.js`) is where Strength totals, Day/Night steps, and kills happen. `actions.js` builds the list of legal Actions per step (`collectActions`), and each option carries its own `mark` for once-per-round tracking.

### 4. AI (`src/ai/`)

- `ai/index.js` picks by `player.level`: `random` (fuzzing and the weakest fallback) or `heuristicDecide` in `heuristic.js` for `easy` / `normal` / `hard`.
- `heuristic.js` has a `LEVELS` table (noise, lapse rate, `plan`, `count`, `day`) and one handler per request purpose in the `H` map. Purposes without a handler use `generic`.
- **Fairness rule:** the AI may read only public information and its own hand and face-down cards. It must never read opponents' hands, unrevealed bids, or face-down cards. Only `hard` may card-count, and only using the union of an opponent's hidden zones as a pool. When adding an AI heuristic, check every state read for hidden information.

### 5. UI (`src/ui/`)

- `app.js` is the controller: `boot`, `newSession`, `pump()` (runs AI steps with pacing from the speed preference), and `render()`. The UI re-renders from engine state. Panels, decisions, cards and the log return HTML strings and get events through delegation. Human input goes back to the engine only as answers via `session.respond`.
- Shared UI state is the single mutable `ui` object in `state.js`.
- Persistence uses `store` from `util.js`, which wraps `localStorage` under the `tokc.` prefix (`save`, `setup`, `prefs`). Its accessors already catch errors, so keep access going through `store`.
- `log.js` must not reveal identities of hidden cards, since the log is shown to all players.
- Hot-seat play: `ui.locked` is the privacy curtain between human turns, and `viewerPid()` decides whose hand is shown.
- Every user-visible string goes through `t(key)` in `i18n.js`, which holds `vi` (default) and `en` dictionaries. Add the key to both, then run `tools/i18n_check.mjs`. Card names stay in English on purpose, as on the printed cards.

### Conventions

- Source comments and code are in English. UI text is Vietnamese and English. The README is in Vietnamese.
- Game length is `short` (4 years), `standard` (5) or `extended` (6), from `GAME_LENGTHS`.
- Assets in `assets/` are WebP images taken from the user's personal Tabletop Simulator mod, for personal use only (see README). Do not redistribute them or add new copyrighted art.
