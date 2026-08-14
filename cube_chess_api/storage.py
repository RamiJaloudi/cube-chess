from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from .engine import CubeGame, GameRuleError


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StorageError(RuntimeError):
    pass


class ActiveMatchExists(StorageError):
    pass


class Database:
    def __init__(self, path: Path | str, token_pepper: str = ""):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.token_pepper = token_pepper
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    key_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    revoked INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS matches (
                    id TEXT PRIMARY KEY,
                    created_by TEXT NOT NULL REFERENCES api_keys(id),
                    state_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('active','completed','closed')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS one_active_match ON matches((1)) WHERE status='active';
                CREATE TABLE IF NOT EXISTS seat_tokens (
                    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
                    army_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    revoked INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(match_id, army_id)
                );
                CREATE TABLE IF NOT EXISTS events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_by_match ON events(match_id, sequence);
                """
            )

    def _hash(self, token: str) -> str:
        return sha256(f"{self.token_pepper}:{token}".encode("utf-8")).hexdigest()

    def create_api_key(self, label: str) -> dict[str, str]:
        raw = f"cck_{secrets.token_urlsafe(32)}"
        key_id = str(uuid4())
        with self.connect() as connection:
            connection.execute("INSERT INTO api_keys(id,label,key_hash,created_at) VALUES(?,?,?,?)", (key_id, label, self._hash(raw), _now()))
        return {"id": key_id, "label": label, "api_key": raw}

    def authenticate_api_key(self, raw: str | None) -> dict[str, str] | None:
        if not raw:
            return None
        with self.connect() as connection:
            row = connection.execute("SELECT id,label FROM api_keys WHERE key_hash=? AND revoked=0", (self._hash(raw),)).fetchone()
        return dict(row) if row else None

    def revoke_api_key(self, key_id: str) -> None:
        with self.connect() as connection:
            connection.execute("UPDATE api_keys SET revoked=1 WHERE id=?", (key_id,))

    def create_match(self, game: CubeGame, created_by: str) -> str:
        match_id, timestamp = str(uuid4()), _now()
        try:
            with self.connect() as connection:
                connection.execute(
                    "INSERT INTO matches(id,created_by,state_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                    (match_id, created_by, json.dumps(game.snapshot(), separators=(",", ":")), "completed" if game.game_over else "active", timestamp, timestamp),
                )
                connection.execute(
                    "INSERT INTO events(match_id,event_type,payload_json,created_at) VALUES(?,?,?,?)",
                    (match_id, "match.created", json.dumps({"stateVersion": game.state_version, "mode": game.config["kind"]}), timestamp),
                )
        except sqlite3.IntegrityError as error:
            if "one_active_match" in str(error) or "UNIQUE constraint failed: index 'one_active_match'" in str(error):
                raise ActiveMatchExists("Version one permits one active match") from error
            raise
        return match_id

    def load_match(self, match_id: str) -> CubeGame | None:
        with self.connect() as connection:
            row = connection.execute("SELECT state_json FROM matches WHERE id=?", (match_id,)).fetchone()
        return CubeGame.from_snapshot(json.loads(row["state_json"])) if row else None

    def match_record(self, match_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT id,created_by,status,created_at,updated_at FROM matches WHERE id=?", (match_id,)).fetchone()
        return dict(row) if row else None

    def list_matches(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT id,created_by,status,created_at,updated_at FROM matches ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]

    def active_match(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT id,created_by,status,created_at,updated_at FROM matches WHERE status='active' LIMIT 1").fetchone()
        return dict(row) if row else None

    def save_match(self, match_id: str, game: CubeGame, event_type: str, payload: dict[str, Any]) -> int:
        timestamp = _now()
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE matches SET state_json=?,status=?,updated_at=? WHERE id=?",
                (json.dumps(game.snapshot(), separators=(",", ":")), "completed" if game.game_over else "active", timestamp, match_id),
            )
            if cursor.rowcount != 1:
                raise GameRuleError("Match was not found")
            event = connection.execute(
                "INSERT INTO events(match_id,event_type,payload_json,created_at) VALUES(?,?,?,?)",
                (match_id, event_type, json.dumps(payload, separators=(",", ":")), timestamp),
            )
        return int(event.lastrowid)

    def close_match(self, match_id: str, created_by: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("UPDATE matches SET status='closed',updated_at=? WHERE id=? AND created_by=?", (_now(), match_id, created_by))
        return cursor.rowcount == 1

    def issue_seat_token(self, match_id: str, army_id: str) -> str:
        raw = f"ccs_{secrets.token_urlsafe(32)}"
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO seat_tokens(match_id,army_id,token_hash,created_at,revoked) VALUES(?,?,?,?,0) ON CONFLICT(match_id,army_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,revoked=0",
                (match_id, army_id, self._hash(raw), _now()),
            )
        return raw

    def authenticate_seat_token(self, match_id: str, raw: str | None) -> str | None:
        if not raw:
            return None
        with self.connect() as connection:
            row = connection.execute("SELECT army_id FROM seat_tokens WHERE match_id=? AND token_hash=? AND revoked=0", (match_id, self._hash(raw))).fetchone()
        return row["army_id"] if row else None

    def events(self, match_id: str, after: int = 0, limit: int = 200) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT sequence,event_type,payload_json,created_at FROM events WHERE match_id=? AND sequence>? ORDER BY sequence LIMIT ?",
                (match_id, after, min(max(limit, 1), 1000)),
            ).fetchall()
        return [{"sequence": row["sequence"], "type": row["event_type"], "payload": json.loads(row["payload_json"]), "createdAt": row["created_at"]} for row in rows]
