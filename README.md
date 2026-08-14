# Cube Chess

Cube Chess is a browser-based 3D chess variant played from inside a six-faced cube. Traditional armies begin on flat 8x8 planes; pieces that break through the opposing back rank can later climb and move across connected cube faces.

## Technology

- Browser-native JavaScript modules
- WebGL rendering with a WebXR interaction path
- HTML and CSS interface
- Deterministic local rules engine and CPU player
- Small dependency-free Node.js static server

There is no compilation or bundling step in this playable prototype.

## Run locally

Install Node.js 18 or newer, then run:

```powershell
npm start
```

Open `http://127.0.0.1:4173/`.

To use another port in PowerShell:

```powershell
$env:CUBE_CHESS_PORT=4174
npm start
```

The renderer is loaded from a public CDN, so the first page load requires an internet connection.

## Play formats

- **Standard Chess:** traditional one-versus-one chess on the floor plane, presented from inside the cube.
- **Coalition:** Face-Off, Double Bind, Triple Threat, Fourfront, Five-Alarm Siege, and Against All Sides.
- **Teams:** Crossfire, Tri-Axis, Fourfront War, Pressure Cube, and Total Cube War.
- **Free-for-All:** Free-4-All, Hex Havoc, Octa-Brawl, Deca-Clash, and the 12-player Mindfield format.

Every army can be assigned to a human or CPU controller. All-CPU matches support spectator play with pause, step, and pace controls.

## Project layout

- `index.html` - browser entry page and interface shell
- `entry.mjs` - feature composition entry point
- `app-v2.mjs` - scene, controls, rendering, and match loop
- `engine-v2.mjs` - board state and Cube Chess rules
- `cpu-v2.mjs` - CPU move selection
- `styles*.css` - cumulative visual layers used by the live prototype
- `server.mjs` - local static server
- `RULES.md` - current gameplay rules

## Current scope

The prototype supports local desktop play, CPU opponents, CPU-only spectator matches, move CSV export, multiple palettes, and an initial WebXR path. Online matchmaking and authoritative network play are not included.
