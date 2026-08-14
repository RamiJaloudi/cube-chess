from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Controller = Literal["human", "cpu", "external", "gpu"]
Mode = Literal["classic", "standard", "coalition", "teams", "ffa"]


class MatchCreate(BaseModel):
    mode: Mode
    size: int = Field(default=1, ge=1, le=12)
    controllers: dict[str, Controller] = Field(default_factory=dict)
    cpu_style: Literal["casual", "standard", "sharp"] = "standard"


class MoveSubmit(BaseModel):
    move_id: str = Field(min_length=8, max_length=128)
    state_version: int = Field(ge=0)


class DrawResponse(BaseModel):
    accept: bool


class MatchClose(BaseModel):
    reason: str = Field(default="closed by creator", max_length=200)


class AutomationUpdate(BaseModel):
    action: Literal["pause", "resume", "step", "set-pace", "set-style"]
    pace_ms: int | None = Field(default=None, ge=0, le=60000)
    cpu_style: Literal["casual", "standard", "sharp"] | None = None


class ControllerUpdate(BaseModel):
    controller: Controller


class WebSocketCommand(BaseModel):
    type: Literal["move.submit", "draw.offer", "draw.respond", "resign", "state.get", "ping"]
    move_id: str | None = None
    state_version: int | None = None
    accept: bool | None = None
