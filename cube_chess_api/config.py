from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_path: Path
    token_pepper: str
    cors_origins: tuple[str, ...]
    agent_pace_ms: int
    gpu_agent_plugin: str | None
    gpu_agent_url: str | None
    gpu_agent_bearer_token: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        origins = os.getenv("CUBE_CHESS_CORS_ORIGINS", "http://127.0.0.1:4173,http://127.0.0.1:4174,http://localhost:4173,http://localhost:4174")
        return cls(
            database_path=Path(os.getenv("CUBE_CHESS_DB", "data/cube_chess.db")).resolve(),
            token_pepper=os.getenv("CUBE_CHESS_TOKEN_PEPPER", ""),
            cors_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
            agent_pace_ms=max(0, int(os.getenv("CUBE_CHESS_AGENT_PACE_MS", "250"))),
            gpu_agent_plugin=os.getenv("CUBE_CHESS_GPU_AGENT_PLUGIN") or None,
            gpu_agent_url=os.getenv("CUBE_CHESS_GPU_AGENT_URL") or None,
            gpu_agent_bearer_token=os.getenv("CUBE_CHESS_GPU_AGENT_TOKEN") or None,
        )
