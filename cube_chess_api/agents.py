from __future__ import annotations

import asyncio
from importlib import import_module
import inspect
from typing import Any, Callable

import httpx

from .config import Settings
from .engine import GameRuleError


class GpuAgentUnavailable(GameRuleError):
    pass


class GpuAgentAdapter:
    """Loads an in-process GPU plugin or calls a configured model endpoint.

    In-process plugin contract: ``module:attribute``. The attribute may be an
    object, a factory returning an object, or a callable. It receives
    ``state``, ``legal_moves``, and ``army`` and returns a legal ``move_id``.
    Sync and async callables are both supported, so a plugin may use CUDA,
    DirectML, ROCm, or another accelerator without coupling the API to it.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.plugin = self._load_plugin(settings.gpu_agent_plugin) if settings.gpu_agent_plugin else None

    @property
    def configured(self) -> bool:
        return bool(self.plugin or self.settings.gpu_agent_url)

    @property
    def mode(self) -> str | None:
        return "plugin" if self.plugin else "http" if self.settings.gpu_agent_url else None

    def _load_plugin(self, reference: str) -> Any:
        if ":" not in reference:
            raise GpuAgentUnavailable("GPU plugin must use module:attribute syntax")
        module_name, attribute_name = reference.split(":", 1)
        candidate = getattr(import_module(module_name), attribute_name)
        if inspect.isclass(candidate):
            return candidate()
        return candidate

    async def choose_move(self, state: dict[str, Any], legal_moves: list[dict[str, Any]], army: dict[str, Any]) -> str:
        if not legal_moves:
            raise GpuAgentUnavailable("No legal moves are available")
        if self.plugin:
            target = getattr(self.plugin, "choose_move", self.plugin)
            result = target(state=state, legal_moves=legal_moves, army=army)
            move_id = await result if inspect.isawaitable(result) else result
        elif self.settings.gpu_agent_url:
            headers = {"Authorization": f"Bearer {self.settings.gpu_agent_bearer_token}"} if self.settings.gpu_agent_bearer_token else {}
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(self.settings.gpu_agent_url, json={"state": state, "legal_moves": legal_moves, "army": army}, headers=headers)
                response.raise_for_status()
                move_id = response.json().get("move_id")
        else:
            raise GpuAgentUnavailable("No server-hosted GPU agent is configured")
        legal_ids = {move["move_id"] for move in legal_moves}
        if move_id not in legal_ids:
            raise GameRuleError("GPU agent returned an illegal move_id")
        return str(move_id)


async def maybe_to_thread(function: Callable[..., Any], *args: Any) -> Any:
    return await asyncio.to_thread(function, *args)
