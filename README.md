# Cube Chess

Cube Chess is a browser-based 3D chess variant played from inside a six-faced cube. Traditional armies begin on flat 8x8 planes; pieces that break through the opposing back rank can later climb and move across connected cube faces.

The playable prototype now has two compatible paths:

- Local browser play with human and CPU controllers.
- An authoritative FastAPI service for human, external-agent, CPU, and GPU-agent matches.

## Lean technology stack

- Browser-native JavaScript modules, HTML, and CSS
- Three.js/WebGL rendering with a WebXR interaction path
- Dependency-free Node.js static server
- Python 3.11+ and FastAPI for the agent API
- SQLite for durable match state, event history, API keys, and seat tokens
- REST for commands and polling; WebSocket for real-time match events

There is no browser compilation or bundling step.

## Local browser play

Install Node.js 18 or newer, then run:

```powershell
npm start
```

Open `http://127.0.0.1:4173/`. The renderer is loaded from a public CDN, so the first page load requires an internet connection.

## Agent API

Create and activate a Python virtual environment, then run:

```powershell
python -m pip install -r requirements-api.txt
python -m cube_chess_api.cli create-key --label local-owner
npm run api
```

The key is displayed once. Keep it private. The API listens at `http://127.0.0.1:8000`, with interactive OpenAPI documentation at `/docs`.

Run `npm start` in a second terminal. The setup panel in the game accepts the API URL, API key, match ID, and optional seat token. An API key is always required; a scoped seat token is additionally required to make moves or use player actions.

See [API.md](API.md) for match creation, agent interaction, WebSockets, GPU adapters, and security details.

## Play formats

- **Standard Chess:** traditional one-versus-one chess on the floor plane, presented from inside the cube.
- **Coalition:** Face-Off, Double Bind, Triple Threat, Fourfront, Five-Alarm Siege, and Against All Sides.
- **Teams:** Crossfire, Tri-Axis, Fourfront War, Pressure Cube, and Total Cube War.
- **Free-for-All:** Free-4-All, Hex Havoc, Octa-Brawl, Deca-Clash, and the 12-player Mindfield format.

Every army can be human, CPU, an external agent, or a configured server-hosted GPU agent. All-CPU/GPU matches support spectator play with pause, step, pace, and CPU-style controls. Match moves can be exported to CSV.

## Verification

```powershell
npm test
npm run check:browser
```

The tests cover traditional and cube rules, mode configuration, legal move IDs, stale-state rejection, persistence, authentication, WebSockets, FFA resignation, GPU plugin turns, spectator controls, and CSV export.

## Project layout

- `index.html`, `entry.mjs`, `app-v2.mjs` - browser entry, feature composition, 3D scene, controls, and local match loop
- `engine-v2.mjs`, `cpu-v2.mjs` - browser rules and CPU player
- `api-browser.mjs` - optional browser connection to authoritative API matches
- `cube_chess_api/` - FastAPI app, Python rules engine, automation, persistence, security, events, GPU adapter, and CSV export
- `tests/` - Python rules and API regression suite
- `styles*.css` - cumulative visual layers used by the playable prototype
- `server.mjs` - local static server
- `RULES.md` - current gameplay rules
- `API.md` - API setup and protocol guide

## Current scope

Version one intentionally permits one active match at a time. Active state survives API restarts, and completed matches, events, and replays remain in SQLite. Webhooks and hosted internet matchmaking are not part of this local-first version; the event model is ready for a later webhook layer.
