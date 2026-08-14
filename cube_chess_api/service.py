from __future__ import annotations

import asyncio
from copy import deepcopy
import random
from typing import Any

from .agents import GpuAgentAdapter
from .config import Settings
from .engine import CubeGame, GameRuleError, choose_cpu_move, make_config
from .events import EventHub
from .schemas import MatchCreate
from .storage import Database


class MatchNotFound(GameRuleError):
    pass


class MatchService:
    def __init__(self, database: Database, settings: Settings, event_hub: EventHub, gpu: GpuAgentAdapter):
        self.database, self.settings, self.event_hub, self.gpu = database, settings, event_hub, gpu
        self.locks: dict[str, asyncio.Lock] = {}
        self.automation_tasks: dict[str, asyncio.Task[Any]] = {}
        self.random = random.Random()

    def _lock(self, match_id: str) -> asyncio.Lock:
        return self.locks.setdefault(match_id, asyncio.Lock())

    def _load(self, match_id: str) -> CubeGame:
        game = self.database.load_match(match_id)
        if not game:
            raise MatchNotFound("Match was not found")
        return game

    def _require_creator(self, match_id: str, creator_id: str) -> dict[str, Any]:
        record = self.database.match_record(match_id)
        if not record:
            raise MatchNotFound("Match was not found")
        if record["created_by"] != creator_id:
            raise GameRuleError("Only the match creator may perform this action")
        return record

    async def _save_and_broadcast(self, match_id: str, game: CubeGame, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        event_payload = {**deepcopy(payload), "stateVersion": game.state_version}
        sequence = self.database.save_match(match_id, game, event_type, event_payload)
        state = game.public_state()
        await self.event_hub.broadcast(match_id, {
            "type": event_type,
            "matchId": match_id,
            "sequence": sequence,
            "payload": {**event_payload, "state": state},
        })
        return state

    async def create_match(self, request: MatchCreate, creator_id: str) -> tuple[str, CubeGame]:
        config = make_config(request.mode, request.size)
        unknown = set(request.controllers) - {army["id"] for army in config["armies"]}
        if unknown:
            raise GameRuleError(f"Unknown army IDs: {', '.join(sorted(unknown))}")
        for army in config["armies"]:
            if army["id"] in request.controllers:
                army["controller"] = request.controllers[army["id"]]
        config.update(cpuStyle=request.cpu_style, agentPaceMs=self.settings.agent_pace_ms, automationPaused=False, stepAllowance=0)
        game = CubeGame(config)
        match_id = self.database.create_match(game, creator_id)
        self.kick_automation(match_id)
        return match_id, game

    def get_state(self, match_id: str, include_legal_moves: bool = False) -> dict[str, Any]:
        return self._load(match_id).public_state(include_legal_moves)

    def list_matches(self) -> list[dict[str, Any]]:
        return self.database.list_matches()

    def issue_seat_token(self, match_id: str, army_id: str, creator_id: str) -> str:
        self._require_creator(match_id, creator_id)
        if not self._load(match_id).army(army_id):
            raise GameRuleError("Army was not found in this match")
        return self.database.issue_seat_token(match_id, army_id)

    def seat_for_token(self, match_id: str, token: str | None) -> str:
        self._load(match_id)
        army_id = self.database.authenticate_seat_token(match_id, token)
        if not army_id:
            raise GameRuleError("A valid X-Seat-Token header is required")
        return army_id

    def legal_moves(self, match_id: str, army_id: str) -> dict[str, Any]:
        game = self._load(match_id)
        if game.game_over:
            moves = []
        else:
            if game.current_army()["id"] != army_id:
                raise GameRuleError("It is not this army's turn")
            moves = game.public_legal_moves(army_id)
        return {"matchId": match_id, "armyId": army_id, "stateVersion": game.state_version, "legalMoves": moves}

    async def submit_move(self, match_id: str, army_id: str, move_id: str, state_version: int) -> dict[str, Any]:
        async with self._lock(match_id):
            game = self._load(match_id)
            if game.current_army()["id"] != army_id:
                raise GameRuleError("It is not this army's turn")
            result = game.play_move_id(move_id, state_version)
            state = await self._save_and_broadcast(match_id, game, "move.played", {"armyId": army_id, "move": result})
        self.kick_automation(match_id)
        return {"matchId": match_id, "move": result, "state": state}

    async def offer_draw(self, match_id: str, army_id: str) -> dict[str, Any]:
        async with self._lock(match_id):
            game = self._load(match_id)
            offer = game.offer_draw(army_id)
            self._resolve_automated_draw_votes(game)
            state = await self._save_and_broadcast(match_id, game, "draw.updated", {"armyId": army_id, "offer": offer})
        return {"matchId": match_id, "state": state}

    def _resolve_automated_draw_votes(self, game: CubeGame) -> None:
        if not game.draw_offer or game.game_over:
            return
        offering_team = game.draw_offer["offeringTeam"]
        for team in list(game.draw_offer.get("requiredTeams", [])):
            voters = [army for army in game.armies if army["team"] == team and army["id"] not in game.eliminated]
            if not voters or any(army.get("controller") in {"human", "external"} for army in voters):
                continue
            voter = voters[0]
            accepted = self._cpu_accepts_draw(game, offering_team, team)
            game.respond_draw(voter["id"], accepted)
            if not accepted or game.game_over or not game.draw_offer:
                break

    def _team_material(self, game: CubeGame, team: str) -> int:
        values = {"pawn": 1, "knight": 3, "bishop": 3, "rook": 5, "queen": 9, "king": 0}
        return sum(values.get(piece["type"], 0) for piece in game.board.values() if (game.army(piece["armyId"]) or {}).get("team") == team)

    def _cpu_accepts_draw(self, game: CubeGame, offering_team: str, voting_team: str) -> bool:
        return self._team_material(game, voting_team) <= self._team_material(game, offering_team) or self.random.random() < 0.12

    async def respond_draw(self, match_id: str, army_id: str, accept: bool) -> dict[str, Any]:
        async with self._lock(match_id):
            game = self._load(match_id)
            result = game.respond_draw(army_id, accept)
            state = await self._save_and_broadcast(match_id, game, "draw.updated", {"armyId": army_id, "response": result})
        return {"matchId": match_id, "result": result, "state": state}

    async def resign(self, match_id: str, army_id: str) -> dict[str, Any]:
        async with self._lock(match_id):
            game = self._load(match_id)
            result = game.resign(army_id)
            state = await self._save_and_broadcast(match_id, game, "army.resigned", {"armyId": army_id, "result": result})
        self.kick_automation(match_id)
        return {"matchId": match_id, "result": result, "state": state}

    async def close_match(self, match_id: str, creator_id: str, reason: str) -> None:
        self._require_creator(match_id, creator_id)
        if not self.database.close_match(match_id, creator_id):
            raise MatchNotFound("Match was not found")
        task = self.automation_tasks.pop(match_id, None)
        if task:
            task.cancel()
        await self.event_hub.broadcast(match_id, {"type": "match.closed", "matchId": match_id, "payload": {"reason": reason}})

    async def update_controller(self, match_id: str, army_id: str, controller: str, creator_id: str) -> dict[str, Any]:
        async with self._lock(match_id):
            self._require_creator(match_id, creator_id)
            game = self._load(match_id)
            army = game.army(army_id)
            if not army:
                raise GameRuleError("Army was not found in this match")
            army["controller"] = controller
            for configured in game.config["armies"]:
                if configured["id"] == army_id:
                    configured["controller"] = controller
                    break
            state = await self._save_and_broadcast(match_id, game, "seat.controller.changed", {"armyId": army_id, "controller": controller})
        self.kick_automation(match_id)
        return {"matchId": match_id, "state": state}

    async def update_automation(self, match_id: str, creator_id: str, action: str, pace_ms: int | None = None, cpu_style: str | None = None) -> dict[str, Any]:
        async with self._lock(match_id):
            self._require_creator(match_id, creator_id)
            game = self._load(match_id)
            if action == "pause":
                game.config["automationPaused"] = True
            elif action == "resume":
                game.config["automationPaused"], game.config["stepAllowance"] = False, 0
            elif action == "step":
                game.config["automationPaused"] = True
                game.config["stepAllowance"] = int(game.config.get("stepAllowance", 0)) + 1
            elif action == "set-pace":
                if pace_ms is None:
                    raise GameRuleError("pace_ms is required for set-pace")
                game.config["agentPaceMs"] = pace_ms
            elif action == "set-style":
                if cpu_style is None:
                    raise GameRuleError("cpu_style is required for set-style")
                game.config["cpuStyle"] = cpu_style
            else:
                raise GameRuleError("Unknown automation action")
            automation = {
                "paused": bool(game.config.get("automationPaused")),
                "stepAllowance": int(game.config.get("stepAllowance", 0)),
                "paceMs": int(game.config.get("agentPaceMs", self.settings.agent_pace_ms)),
                "cpuStyle": game.config.get("cpuStyle", "standard"),
            }
            state = await self._save_and_broadcast(match_id, game, "automation.updated", {"action": action, "automation": automation})
        if action in {"resume", "step"}:
            self.kick_automation(match_id)
        return {"matchId": match_id, "automation": automation, "state": state}

    def kick_automation(self, match_id: str) -> None:
        task = self.automation_tasks.get(match_id)
        if task and not task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self.automation_tasks[match_id] = loop.create_task(self._automation_loop(match_id))

    async def resume_active_match(self) -> None:
        active = self.database.active_match()
        if active:
            self.kick_automation(active["id"])

    async def _automation_loop(self, match_id: str) -> None:
        try:
            while True:
                async with self._lock(match_id):
                    game = self._load(match_id)
                    if game.game_over:
                        return
                    paused, allowance = bool(game.config.get("automationPaused", False)), int(game.config.get("stepAllowance", 0))
                    if paused and allowance <= 0:
                        return
                    army = deepcopy(game.current_army())
                    controller = army.get("controller", "human")
                    if controller not in {"cpu", "gpu"}:
                        return
                    expected_version, decision_game = game.state_version, game.clone()
                    pace_ms = int(game.config.get("agentPaceMs", self.settings.agent_pace_ms))
                if pace_ms:
                    await asyncio.sleep(pace_ms / 1000)
                if controller == "cpu":
                    record = choose_cpu_move(decision_game, army["id"], decision_game.config.get("cpuStyle", "standard"), self.random)
                    move_id = record["move_id"] if record else None
                else:
                    move_id = await self.gpu.choose_move(decision_game.public_state(), decision_game.public_legal_moves(army["id"]), army)
                if not move_id:
                    return
                async with self._lock(match_id):
                    game = self._load(match_id)
                    current = game.current_army()
                    if game.game_over or game.state_version != expected_version or current["id"] != army["id"] or current.get("controller", "human") != controller:
                        continue
                    if game.config.get("automationPaused", False):
                        allowance = int(game.config.get("stepAllowance", 0))
                        if allowance <= 0:
                            return
                        game.config["stepAllowance"] = allowance - 1
                    result = game.play_move_id(move_id, expected_version)
                    await self._save_and_broadcast(match_id, game, "move.played", {"armyId": army["id"], "controller": controller, "move": result})
        except asyncio.CancelledError:
            raise
        except (GameRuleError, MatchNotFound):
            return
