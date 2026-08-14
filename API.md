# Cube Chess Agent API

## Design brief

The API uses an authoritative Python implementation of the complete current rules and game modes. The existing 3D browser can connect to it, while external agents can use REST, WebSocket, or both. Legal moves come from the server and carry state-specific `move_id` values, so agents do not need to duplicate cube geometry or invent notation.

Version one is local-first on Windows, supports one active match, persists active and completed games in SQLite, and retains replay events. Anyone with an API key can create or watch matches. The creator assigns controllers and issues scoped seat tokens. Every API operation requires the key; gameplay also requires the seat token.

GPU support has two meanings:

- An external GPU agent uses the normal API from its own process or machine.
- A server-hosted GPU agent is loaded through a Python plugin or called at a configured HTTP endpoint.

REST supports commands and reliable polling. WebSocket delivers real-time snapshots and events. Webhooks are intentionally deferred from version one.

## Start

```powershell
python -m pip install -r requirements-api.txt
$env:CUBE_CHESS_TOKEN_PEPPER="use-a-long-random-local-secret"
python -m cube_chess_api.cli create-key --label local-owner
python -m cube_chess_api
```

Useful URLs:

- Health: `GET http://127.0.0.1:8000/health`
- OpenAPI UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

The SQLite database defaults to `data/cube_chess.db`. API keys and seat tokens are stored only as hashes. The raw value is returned once when created.

## Authentication

REST headers:

```text
X-API-Key: cck_...
X-Seat-Token: ccs_...   # additionally required for seat actions
```

WebSocket v1 uses query parameters because browser WebSocket clients cannot set custom headers:

```text
ws://127.0.0.1:8000/ws/v1/matches/{match_id}?api_key=...&seat_token=...
```

Use this only over the local interface in v1. A hosted version should use TLS and exchange the API key for a short-lived WebSocket ticket to keep long-lived secrets out of URLs and logs.

## Match lifecycle

Create Standard CPU versus CPU:

```powershell
$headers = @{ "X-API-Key" = $apiKey }
$body = @{
  mode = "classic"
  size = 1
  controllers = @{ "D-A" = "cpu"; "D-B" = "cpu" }
  cpu_style = "standard"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/matches -Headers $headers -ContentType application/json -Body $body
```

Allowed modes and sizes:

- `classic`: 1
- `coalition`: 1 through 6
- `teams`: 2 through 6
- `ffa`: 4, 6, 8, 10, or 12

Allowed controllers are `human`, `cpu`, `external`, and `gpu`. A `gpu` seat requires a configured server-hosted adapter; an independent GPU process should normally use `external`.

The creator can issue or rotate a seat token:

```text
POST /api/v1/matches/{match_id}/seats/{army_id}/token
```

The creator can change a seat controller:

```text
POST /api/v1/matches/{match_id}/seats/{army_id}/controller
{"controller":"cpu"}
```

## Agent move loop

1. Query `GET /api/v1/matches/{match_id}/legal-moves` with API-key and seat-token headers.
2. Select one returned `move_id`.
3. Submit it with the exact returned `stateVersion`.

```text
POST /api/v1/matches/{match_id}/moves
{"move_id":"...","state_version":12}
```

A stale version or invalid move is rejected with HTTP 409. Move records include structured `from` and `to` coordinates such as `{ "face": "D", "row": 6, "col": 4 }`, along with piece, capture, promotion, castle, gateway, and climb details where applicable.

## Real-time events and polling

Connect to `/ws/v1/matches/{match_id}` for an immediate `snapshot`, then events such as:

- `move.played`
- `draw.updated`
- `army.resigned`
- `seat.controller.changed`
- `automation.updated`
- `match.closed`

WebSocket commands are `ping`, `state.get`, `move.submit`, `draw.offer`, `draw.respond`, and `resign`. Polling clients can use:

```text
GET /api/v1/matches/{match_id}
GET /api/v1/matches/{match_id}/events?after={sequence}
```

## Spectator automation

The creator controls CPU/GPU playback through:

```text
POST /api/v1/matches/{match_id}/automation
```

Bodies:

```json
{"action":"pause"}
{"action":"resume"}
{"action":"step"}
{"action":"set-pace","pace_ms":650}
{"action":"set-style","cpu_style":"sharp"}
```

`step` leaves automation paused and advances exactly one automated army turn. Settings are stored with the match and survive API restarts.

## Draws, resignation, and export

Seat actions:

```text
POST /api/v1/matches/{match_id}/draw-offer
POST /api/v1/matches/{match_id}/draw-response   {"accept":true}
POST /api/v1/matches/{match_id}/resign
```

In Free-for-All, a resigned army is skipped and its pieces remain as board obstacles. A draw requires all remaining opposing teams to accept. CPU/GPU-only teams apply the server draw policy automatically.

Download the move history:

```text
GET /api/v1/matches/{match_id}/export.csv
```

## Server-hosted GPU adapter

In-process plugin:

```powershell
$env:CUBE_CHESS_GPU_AGENT_PLUGIN="my_agent:choose_move"
python -m cube_chess_api
```

The callable may be synchronous or asynchronous:

```python
def choose_move(*, state, legal_moves, army):
    # Run CUDA, DirectML, ROCm, ONNX, or another inference stack here.
    return legal_moves[0]["move_id"]
```

HTTP model service:

```powershell
$env:CUBE_CHESS_GPU_AGENT_URL="http://127.0.0.1:9000/choose-move"
$env:CUBE_CHESS_GPU_AGENT_TOKEN="private-model-token"
python -m cube_chess_api
```

The endpoint receives `state`, `legal_moves`, and `army`, and returns `{ "move_id": "..." }`. The API validates that the answer is one of the current legal IDs before applying it.
