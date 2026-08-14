from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .agents import GpuAgentAdapter
from .config import Settings
from .engine import GameRuleError
from .events import EventHub
from .export import csv_filename, game_to_csv
from .schemas import AutomationUpdate, ControllerUpdate, DrawResponse, MatchClose, MatchCreate, MoveSubmit, WebSocketCommand
from .service import MatchNotFound, MatchService
from .storage import ActiveMatchExists, Database


def create_app(settings: Settings | None = None) -> FastAPI:
    configured = settings or Settings.from_env()
    database = Database(configured.database_path, configured.token_pepper)
    event_hub = EventHub()
    service = MatchService(database, configured, event_hub, GpuAgentAdapter(configured))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await service.resume_active_match()
        yield
        for task in list(service.automation_tasks.values()):
            task.cancel()

    app = FastAPI(
        title="Cube Chess Agent API",
        version="0.2.0",
        description="Authoritative Cube Chess matches for human, CPU, external, and GPU-hosted agents.",
        lifespan=lifespan,
    )
    app.state.settings = configured
    app.state.database = database
    app.state.service = service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(configured.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key", "X-Seat-Token"],
    )

    @app.exception_handler(GameRuleError)
    async def game_rule_error(_: Request, error: GameRuleError):
        code = status.HTTP_404_NOT_FOUND if isinstance(error, MatchNotFound) else status.HTTP_409_CONFLICT
        return JSONResponse(status_code=code, content={"error": error.__class__.__name__, "detail": str(error)})

    @app.exception_handler(ActiveMatchExists)
    async def active_match_error(_: Request, error: ActiveMatchExists):
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"error": "ActiveMatchExists", "detail": str(error)})

    def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> dict[str, str]:
        principal = database.authenticate_api_key(x_api_key)
        if not principal:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A valid X-API-Key header is required")
        return principal

    def require_viewer(
        match_id: str,
        principal: dict[str, str] = Depends(require_api_key),
        x_seat_token: str | None = Header(default=None, alias="X-Seat-Token"),
    ) -> dict[str, str | None]:
        return {"apiKeyId": principal["id"], "armyId": database.authenticate_seat_token(match_id, x_seat_token)}

    def require_seat(
        match_id: str,
        _: dict[str, str] = Depends(require_api_key),
        x_seat_token: str | None = Header(default=None, alias="X-Seat-Token"),
    ) -> str:
        return service.seat_for_token(match_id, x_seat_token)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "service": "cube-chess-agent-api", "activeMatch": database.active_match()}

    @app.get("/api/v1/capabilities")
    async def capabilities(_: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        return {
            "apiVersion": "v1",
            "singleActiveMatch": True,
            "protocols": ["rest", "websocket"],
            "webhooks": False,
            "persistence": {"activeMatches": True, "completedMatches": True, "events": True},
            "modes": {"classic": [1], "coalition": [1, 2, 3, 4, 5, 6], "teams": [2, 3, 4, 5, 6], "ffa": [4, 6, 8, 10, 12]},
            "controllers": ["human", "cpu", "external", "gpu"],
            "automation": {"pause": True, "step": True, "pace": True, "cpuStyles": ["casual", "standard", "sharp"]},
            "exports": ["csv"],
            "coordinates": {"faces": ["D", "U", "F", "B", "L", "R"], "rows": [0, 7], "cols": [0, 7]},
            "gpuAgent": {"configured": service.gpu.configured, "mode": service.gpu.mode},
        }

    @app.get("/api/v1/matches")
    async def list_matches(_: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        return {"matches": service.list_matches()}

    @app.post("/api/v1/matches", status_code=status.HTTP_201_CREATED)
    async def create_match(body: MatchCreate, principal: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        match_id, game = await service.create_match(body, principal["id"])
        return {"matchId": match_id, "state": game.public_state(), "seatIds": [army["id"] for army in game.armies]}

    @app.get("/api/v1/matches/{match_id}")
    async def match_state(match_id: str, include_legal_moves: bool = Query(False), _: dict[str, str | None] = Depends(require_viewer)) -> dict[str, Any]:
        return {"matchId": match_id, "state": service.get_state(match_id, include_legal_moves)}

    @app.post("/api/v1/matches/{match_id}/seats/{army_id}/token", status_code=status.HTTP_201_CREATED)
    async def issue_seat_token(match_id: str, army_id: str, principal: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        token = service.issue_seat_token(match_id, army_id, principal["id"])
        return {"matchId": match_id, "armyId": army_id, "seatToken": token, "warning": "This token is shown once. Store it securely."}

    @app.post("/api/v1/matches/{match_id}/seats/{army_id}/controller")
    async def update_controller(match_id: str, army_id: str, body: ControllerUpdate, principal: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        return await service.update_controller(match_id, army_id, body.controller, principal["id"])

    @app.post("/api/v1/matches/{match_id}/automation")
    async def update_automation(match_id: str, body: AutomationUpdate, principal: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        return await service.update_automation(match_id, principal["id"], body.action, body.pace_ms, body.cpu_style)

    @app.get("/api/v1/matches/{match_id}/legal-moves")
    async def legal_moves(match_id: str, army_id: str = Depends(require_seat)) -> dict[str, Any]:
        return service.legal_moves(match_id, army_id)

    @app.post("/api/v1/matches/{match_id}/moves")
    async def submit_move(match_id: str, body: MoveSubmit, army_id: str = Depends(require_seat)) -> dict[str, Any]:
        return await service.submit_move(match_id, army_id, body.move_id, body.state_version)

    @app.post("/api/v1/matches/{match_id}/draw-offer")
    async def offer_draw(match_id: str, army_id: str = Depends(require_seat)) -> dict[str, Any]:
        return await service.offer_draw(match_id, army_id)

    @app.post("/api/v1/matches/{match_id}/draw-response")
    async def respond_draw(match_id: str, body: DrawResponse, army_id: str = Depends(require_seat)) -> dict[str, Any]:
        return await service.respond_draw(match_id, army_id, body.accept)

    @app.post("/api/v1/matches/{match_id}/resign")
    async def resign(match_id: str, army_id: str = Depends(require_seat)) -> dict[str, Any]:
        return await service.resign(match_id, army_id)

    @app.get("/api/v1/matches/{match_id}/events")
    async def events(match_id: str, after: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000), _: dict[str, str | None] = Depends(require_viewer)) -> dict[str, Any]:
        service.get_state(match_id)
        return {"matchId": match_id, "events": database.events(match_id, after, limit)}

    @app.get("/api/v1/matches/{match_id}/export.csv")
    async def export_csv(match_id: str, _: dict[str, str | None] = Depends(require_viewer)) -> Response:
        game = service._load(match_id)
        return Response(
            content=game_to_csv(game),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{csv_filename(game)}"'},
        )

    @app.post("/api/v1/matches/{match_id}/close")
    async def close_match(match_id: str, body: MatchClose, principal: dict[str, str] = Depends(require_api_key)) -> dict[str, Any]:
        await service.close_match(match_id, principal["id"], body.reason)
        return {"matchId": match_id, "closed": True}

    @app.websocket("/ws/v1/matches/{match_id}")
    async def match_socket(websocket: WebSocket, match_id: str):
        api_key = websocket.query_params.get("api_key")
        seat_token = websocket.query_params.get("seat_token")
        principal = database.authenticate_api_key(api_key)
        if not principal:
            await websocket.close(code=4401, reason="Valid API key required")
            return
        army_id = database.authenticate_seat_token(match_id, seat_token)
        try:
            state = service.get_state(match_id, include_legal_moves=bool(army_id))
        except MatchNotFound:
            await websocket.close(code=4404, reason="Match not found")
            return
        await event_hub.connect(match_id, websocket)
        await websocket.send_json({"type": "snapshot", "matchId": match_id, "payload": {"state": state, "armyId": army_id}})
        try:
            while True:
                raw = await websocket.receive_json()
                try:
                    command = WebSocketCommand.model_validate(raw)
                    if command.type == "ping":
                        await websocket.send_json({"type": "pong"})
                    elif command.type == "state.get":
                        await websocket.send_json({"type": "snapshot", "matchId": match_id, "payload": {"state": service.get_state(match_id, bool(army_id)), "armyId": army_id}})
                    elif not army_id:
                        raise GameRuleError("A seat token is required for gameplay commands")
                    elif command.type == "move.submit":
                        if command.move_id is None or command.state_version is None:
                            raise GameRuleError("move_id and state_version are required")
                        await service.submit_move(match_id, army_id, command.move_id, command.state_version)
                    elif command.type == "draw.offer":
                        await service.offer_draw(match_id, army_id)
                    elif command.type == "draw.respond":
                        if command.accept is None:
                            raise GameRuleError("accept is required")
                        await service.respond_draw(match_id, army_id, command.accept)
                    elif command.type == "resign":
                        await service.resign(match_id, army_id)
                except (GameRuleError, ValidationError) as error:
                    await websocket.send_json({"type": "error", "error": error.__class__.__name__, "detail": str(error)})
        except WebSocketDisconnect:
            pass
        finally:
            event_hub.disconnect(match_id, websocket)

    return app


app = create_app()
