from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class EventHub:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, match_id: str, socket: WebSocket) -> None:
        await socket.accept()
        self.connections[match_id].add(socket)

    def disconnect(self, match_id: str, socket: WebSocket) -> None:
        self.connections[match_id].discard(socket)
        if not self.connections[match_id]:
            self.connections.pop(match_id, None)

    async def broadcast(self, match_id: str, event: dict[str, Any]) -> None:
        stale = []
        for socket in tuple(self.connections.get(match_id, ())):
            try:
                await socket.send_json(event)
            except Exception:
                stale.append(socket)
        for socket in stale:
            self.disconnect(match_id, socket)
