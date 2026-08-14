from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import random
from typing import Any

N = 8
FACE_ORDER = ["D", "U", "F", "B", "L", "R"]
PIECE_VALUE = {"pawn": 100, "knight": 320, "bishop": 340, "rook": 500, "queen": 900, "king": 20000}
PROMOTIONS = ["queen", "rook", "bishop", "knight"]
PALETTE = ["#ff5b5f", "#64a0ff", "#ffd44d", "#f4f1e8", "#b66cff", "#49d8a5", "#ff8a45", "#55d6ff", "#e66baf", "#9bd84b", "#a7a0ff", "#d8a46b"]
BACK = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"]
ORTHO = [(-1, 0), (1, 0), (0, -1), (0, 1)]
DIAG = [(-1, -1), (-1, 1), (1, -1), (1, 1)]

FACES: dict[str, dict[str, list[int]]] = {
    "F": {"normal": [0, 0, 1], "right": [1, 0, 0], "up": [0, 1, 0]},
    "B": {"normal": [0, 0, -1], "right": [-1, 0, 0], "up": [0, 1, 0]},
    "U": {"normal": [0, 1, 0], "right": [0, 0, 1], "up": [1, 0, 0]},
    "D": {"normal": [0, -1, 0], "right": [0, 0, -1], "up": [1, 0, 0]},
    "R": {"normal": [1, 0, 0], "right": [0, 1, 0], "up": [0, 0, 1]},
    "L": {"normal": [-1, 0, 0], "right": [0, -1, 0], "up": [0, 0, 1]},
}
for _face in FACES.values():
    _face["center"] = _face["normal"]

COALITION_NAMES = {1: "Face-Off", 2: "Double Bind", 3: "Triple Threat", 4: "Fourfront", 5: "Five-Alarm Siege", 6: "Against All Sides"}
TEAM_NAMES = {2: "Crossfire", 3: "Tri-Axis", 4: "Fourfront War", 5: "Pressure Cube", 6: "Total Cube War"}
FFA_NAMES = {4: "Free-4-All", 6: "Hex Havoc", 8: "Octa-Brawl", 10: "Deca-Clash", 12: "Mindfield"}


class GameRuleError(ValueError):
    """Raised when a requested action violates the current game state."""


class StaleStateError(GameRuleError):
    """Raised when a client submits a move from an older state version."""


def square_key(face: str, row: int, col: int) -> str:
    return f"{face},{row},{col}"


def parse_key(value: str) -> dict[str, Any]:
    face, row, col = value.split(",")
    return {"face": face, "row": int(row), "col": int(col)}


def _add(a: list[float], b: list[float]) -> list[float]:
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def _sub(a: list[float], b: list[float]) -> list[float]:
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _scale(a: list[float], amount: float) -> list[float]:
    return [a[0] * amount, a[1] * amount, a[2] * amount]


def _dot(a: list[float], b: list[float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _col_to_u(col: int) -> float:
    return -1 + (col + 0.5) * (2 / N)


def _row_to_v(row: int) -> float:
    return 1 - (row + 0.5) * (2 / N)


def _u_to_col(value: float) -> float:
    return (value + 1) * (N / 2) - 0.5


def _v_to_row(value: float) -> float:
    return (1 - value) * (N / 2) - 0.5


def _clamp(value: int) -> int:
    return max(0, min(N - 1, value))


def _face_by_normal(normal: list[float]) -> str:
    for key, face in FACES.items():
        if all(abs(value - normal[index]) < 0.001 for index, value in enumerate(face["normal"])):
            return key
    raise GameRuleError(f"No cube face for normal {normal}")


def cross_edge(face: str, row: int, col: int, d_row: int, d_col: int) -> dict[str, Any]:
    source = FACES[face]
    over_col = d_col != 0
    if over_col:
        sign, u, v = d_col, d_col, _row_to_v(row)
    else:
        sign, v, u = -d_row, -d_row, _col_to_u(col)
    point = _add(source["center"], _add(_scale(source["right"], u), _scale(source["up"], v)))
    neighbor = _face_by_normal(_scale(source["right"] if over_col else source["up"], sign))
    target = FACES[neighbor]
    diff = _sub(point, target["center"])
    new_u, new_v = _dot(diff, target["right"]), _dot(diff, target["up"])
    if abs(new_u) >= abs(new_v):
        next_d_col, next_d_row = (-1 if new_u > 0 else 1), 0
        next_col, next_row = (N - 1 if new_u > 0 else 0), round(_v_to_row(new_v))
    else:
        next_d_row, next_d_col = (1 if new_v > 0 else -1), 0
        next_row, next_col = (0 if new_v > 0 else N - 1), round(_u_to_col(new_u))
    return {"face": neighbor, "row": _clamp(next_row), "col": _clamp(next_col), "dRow": next_d_row, "dCol": next_d_col}


def next_orthogonal(face: str, row: int, col: int, d_row: int, d_col: int) -> dict[str, Any]:
    next_row, next_col = row + d_row, col + d_col
    if 0 <= next_row < N and 0 <= next_col < N:
        return {"face": face, "row": next_row, "col": next_col, "dRow": d_row, "dCol": d_col}
    return cross_edge(face, row, col, d_row, d_col)


def _world_dir(face: str, d_row: int, d_col: int) -> list[float]:
    source = FACES[face]
    return _add(_scale(source["right"], d_col), _scale(source["up"], -d_row))


def _local_dir(face: str, vector: list[float]) -> dict[str, int]:
    target = FACES[face]
    return {"dRow": round(-_dot(vector, target["up"])), "dCol": round(_dot(vector, target["right"]))}


def _diagonal_across(face: str, row: int, col: int, d_row: int, d_col: int, axis: str, corner: bool) -> dict[str, Any]:
    source = FACES[face]
    primary = cross_edge(face, row, col, d_row, 0) if axis == "row" else cross_edge(face, row, col, 0, d_col)
    parallel_world = _scale(source["right"], d_col) if axis == "row" else _scale(source["up"], -d_row)
    parallel = _local_dir(primary["face"], parallel_world)
    return {
        "face": primary["face"],
        "row": _clamp(primary["row"] + (0 if corner else parallel["dRow"])),
        "col": _clamp(primary["col"] + (0 if corner else parallel["dCol"])),
        "dRow": primary["dRow"] + parallel["dRow"],
        "dCol": primary["dCol"] + parallel["dCol"],
        "cornerChoice": corner,
    }


def next_diagonal(face: str, row: int, col: int, d_row: int, d_col: int) -> list[dict[str, Any]]:
    next_row, next_col = row + d_row, col + d_col
    row_out, col_out = not 0 <= next_row < N, not 0 <= next_col < N
    if not row_out and not col_out:
        return [{"face": face, "row": next_row, "col": next_col, "dRow": d_row, "dCol": d_col, "cornerChoice": False}]
    if row_out and col_out:
        options = [_diagonal_across(face, row, col, d_row, d_col, "row", True), _diagonal_across(face, row, col, d_row, d_col, "col", True)]
        unique: dict[str, dict[str, Any]] = {}
        for option in options:
            unique[square_key(option["face"], option["row"], option["col"])] = option
        return list(unique.values())
    return [_diagonal_across(face, row, col, d_row, d_col, "row" if row_out else "col", False)]


def _step_frame(state: dict[str, Any], axis: str) -> dict[str, Any]:
    direction, other, source_face = state[axis], "b" if axis == "a" else "a", state["face"]
    target = next_orthogonal(state["face"], state["row"], state["col"], direction["dRow"], direction["dCol"])
    if target["face"] == source_face:
        return {**state, "face": target["face"], "row": target["row"], "col": target["col"]}
    moved = {"dRow": target["dRow"], "dCol": target["dCol"]}
    parallel = _local_dir(target["face"], _world_dir(source_face, state[other]["dRow"], state[other]["dCol"]))
    return {"face": target["face"], "row": target["row"], "col": target["col"], "a": moved if axis == "a" else parallel, "b": moved if axis == "b" else parallel}


def cube_knight(face: str, row: int, col: int) -> list[dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for a_row, a_col in ORTHO:
        for b_row, b_col in ORTHO:
            if a_row * b_row + a_col * b_col != 0:
                continue
            state = {"face": face, "row": row, "col": col, "a": {"dRow": a_row, "dCol": a_col}, "b": {"dRow": b_row, "dCol": b_col}}
            state = _step_frame(_step_frame(_step_frame(state, "a"), "a"), "b")
            result = {"face": state["face"], "row": state["row"], "col": state["col"]}
            results[square_key(**result)] = result
    return list(results.values())


def _new_army(face: str, side: str, index: int, **overrides: Any) -> dict[str, Any]:
    army = {"id": f"{face}-{side}", "face": face, "side": side, "forward": -1 if side == "A" else 1, "gatewayRow": 0 if side == "A" else 7, "color": PALETTE[index], "label": f"{face}-{side}"}
    army.update(overrides)
    return army


def make_config(kind: str = "coalition", size: int = 1) -> dict[str, Any]:
    if kind in {"standard", "classic"}:
        armies = [_new_army("D", "A", 0, team="White", commander="White", controller="human", color="#f4f1e8"), _new_army("D", "B", 1, team="Black", commander="Black", controller="cpu", color="#64a0ff")]
        return {"kind": "classic", "classic": True, "size": 1, "faces": 1, "label": "Standard Chess", "tagline": "Traditional 1 vs 1 chess on the floor plane.", "armies": armies}
    if kind == "faceoff":
        kind, size = "coalition", 1
    if kind == "ffa":
        if size not in FFA_NAMES:
            raise GameRuleError("Free-for-All supports 4, 6, 8, 10, or 12 players")
        armies: list[dict[str, Any]] = []
        for index in range(size // 2):
            face = FACE_ORDER[index]
            armies.append(_new_army(face, "A", index * 2, team=f"Solo-{index * 2 + 1}", commander=f"Player {index * 2 + 1}", controller="human" if index == 0 else "cpu"))
            armies.append(_new_army(face, "B", index * 2 + 1, team=f"Solo-{index * 2 + 2}", commander=f"Player {index * 2 + 2}", controller="cpu"))
        return {"kind": kind, "size": size, "faces": size // 2, "label": FFA_NAMES[size], "tagline": "12 minds, where every surface is a threat." if size == 12 else "Every breakthrough opens a new front.", "armies": armies}
    if kind not in {"coalition", "teams"}:
        raise GameRuleError(f"Unknown game mode: {kind}")
    minimum = 2 if kind == "teams" else 1
    if not minimum <= size <= 6:
        raise GameRuleError(f"{kind} size must be between {minimum} and 6")
    armies = []
    for index in range(size):
        face = FACE_ORDER[index]
        if kind == "teams":
            armies.append(_new_army(face, "A", index * 2, team="Axis A", commander=f"A{index + 1}", controller="human" if index == 0 else "cpu"))
            armies.append(_new_army(face, "B", index * 2 + 1, team="Axis B", commander=f"B{index + 1}", controller="cpu"))
        else:
            armies.append(_new_army(face, "A", index * 2, team="Solo", commander="Solo Commander", controller="human"))
            armies.append(_new_army(face, "B", index * 2 + 1, team="Coalition", commander=f"Rival {index + 1}", controller="cpu"))
    label = TEAM_NAMES[size] if kind == "teams" else COALITION_NAMES[size]
    tagline = f"{size} armies per side across {size} planes." if kind == "teams" else ("Ordinary chess begins the journey into the cube." if size == 1 else f"One commander controls {size} armies against {size} rivals.")
    return {"kind": kind, "size": size, "faces": size, "label": label, "tagline": tagline, "armies": armies}


class CubeGame:
    schema_version = 1

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = deepcopy(config or make_config())
        self.armies = deepcopy(self.config["armies"])
        self.reset()

    @property
    def classic(self) -> bool:
        return self.config.get("kind") == "classic" or bool(self.config.get("classic"))

    def reset(self) -> None:
        self.board: dict[str, dict[str, Any]] = {}
        self.turn_index = 0
        self.eliminated: set[str] = set()
        self.history: list[dict[str, Any]] = []
        self.game_over = False
        self.winner: str | None = None
        self.last_event = ""
        self.en_passant: dict[str, Any] = {}
        self.next_piece_id = 1
        self.halfmove_clock = 0
        self.position_counts: dict[str, int] = {}
        self.draw_reason: str | None = None
        self.draw_offer: dict[str, Any] | None = None
        self.state_version = 0
        for army in self.armies:
            back, pawns = (7, 6) if army["side"] == "A" else (0, 1)
            for col in range(N):
                self.board[square_key(army["face"], back, col)] = self._piece(BACK[col], army)
                self.board[square_key(army["face"], pawns, col)] = self._piece("pawn", army)
        if self.classic:
            self._record_position()

    def _piece(self, piece_type: str, army: dict[str, Any]) -> dict[str, Any]:
        piece = {"id": self.next_piece_id, "type": piece_type, "armyId": army["id"], "homeFace": army["face"], "forward": army["forward"], "cubeEnabled": False, "breachReady": False, "hasMoved": False}
        self.next_piece_id += 1
        return piece

    def snapshot(self) -> dict[str, Any]:
        return {"schemaVersion": self.schema_version, "config": deepcopy(self.config), "armies": deepcopy(self.armies), "board": deepcopy(self.board), "turnIndex": self.turn_index, "eliminated": sorted(self.eliminated), "history": deepcopy(self.history), "gameOver": self.game_over, "winner": self.winner, "lastEvent": self.last_event, "enPassant": deepcopy(self.en_passant), "nextPieceId": self.next_piece_id, "halfmoveClock": self.halfmove_clock, "positionCounts": deepcopy(self.position_counts), "drawReason": self.draw_reason, "drawOffer": deepcopy(self.draw_offer), "stateVersion": self.state_version}

    @classmethod
    def from_snapshot(cls, snapshot: dict[str, Any]) -> "CubeGame":
        if snapshot.get("schemaVersion") != cls.schema_version:
            raise GameRuleError("Unsupported game-state schema")
        game = cls.__new__(cls)
        game.config = deepcopy(snapshot["config"])
        game.armies = deepcopy(snapshot["armies"])
        game.board = deepcopy(snapshot["board"])
        game.turn_index = snapshot["turnIndex"]
        game.eliminated = set(snapshot["eliminated"])
        game.history = deepcopy(snapshot["history"])
        game.game_over = snapshot["gameOver"]
        game.winner = snapshot["winner"]
        game.last_event = snapshot["lastEvent"]
        game.en_passant = deepcopy(snapshot["enPassant"])
        game.next_piece_id = snapshot["nextPieceId"]
        game.halfmove_clock = snapshot.get("halfmoveClock", 0)
        game.position_counts = deepcopy(snapshot.get("positionCounts", {}))
        game.draw_reason = snapshot.get("drawReason")
        game.draw_offer = deepcopy(snapshot.get("drawOffer"))
        game.state_version = snapshot.get("stateVersion", len(game.history))
        return game

    def clone(self) -> "CubeGame":
        return CubeGame.from_snapshot(self.snapshot())

    def army(self, army_id: str) -> dict[str, Any] | None:
        return next((army for army in self.armies if army["id"] == army_id), None)

    def current_army(self) -> dict[str, Any]:
        return self.armies[self.turn_index]

    def piece_at(self, square: dict[str, Any]) -> dict[str, Any] | None:
        return self.board.get(square_key(square["face"], square["row"], square["col"]))

    def allied(self, first: str, second: str) -> bool:
        first_army, second_army = self.army(first), self.army(second)
        return bool(first_army and second_army and first_army["team"] == second_army["team"])

    def find_king(self, army_id: str) -> dict[str, Any] | None:
        for key, piece in self.board.items():
            if piece["armyId"] == army_id and piece["type"] == "king":
                return parse_key(key)
        return None

    def generate_pseudo(self, face: str, row: int, col: int, piece: dict[str, Any], attack_map: bool = False) -> list[dict[str, Any]]:
        anchored = self.classic or not piece["cubeEnabled"]
        moves: dict[str, dict[str, Any]] = {}
        army_id = piece["armyId"]

        def add_move(square: dict[str, Any], capture: bool = False, **extra: Any) -> None:
            moves[square_key(square["face"], square["row"], square["col"])] = {"face": square["face"], "row": square["row"], "col": square["col"], "capture": capture, **extra}

        def try_add(square: dict[str, Any]) -> bool:
            occupant = self.piece_at(square)
            if occupant:
                if not self.allied(army_id, occupant["armyId"]) and (attack_map or occupant["type"] != "king"):
                    add_move(square, True, capturedType=occupant["type"])
                return False
            add_move(square)
            return True

        def slide_flat(d_row: int, d_col: int) -> None:
            next_row, next_col = row + d_row, col + d_col
            while 0 <= next_row < N and 0 <= next_col < N:
                if not try_add({"face": face, "row": next_row, "col": next_col}):
                    break
                next_row, next_col = next_row + d_row, next_col + d_col

        def slide_ortho(d_row: int, d_col: int) -> None:
            if anchored:
                slide_flat(d_row, d_col)
                return
            current = {"face": face, "row": row, "col": col, "dRow": d_row, "dCol": d_col}
            seen: set[str] = set()
            for _ in range(48):
                current = next_orthogonal(current["face"], current["row"], current["col"], current["dRow"], current["dCol"])
                marker = f"{square_key(current['face'], current['row'], current['col'])},{current['dRow']},{current['dCol']}"
                if marker in seen:
                    break
                seen.add(marker)
                if not try_add(current):
                    break

        def slide_diag(d_row: int, d_col: int) -> None:
            if anchored:
                slide_flat(d_row, d_col)
                return
            frontier = [{"face": face, "row": row, "col": col, "dRow": d_row, "dCol": d_col}]
            seen: set[str] = set()
            for _ in range(48):
                if not frontier:
                    break
                following: list[dict[str, Any]] = []
                for current in frontier:
                    for square in next_diagonal(current["face"], current["row"], current["col"], current["dRow"], current["dCol"]):
                        marker = f"{square_key(square['face'], square['row'], square['col'])},{square['dRow']},{square['dCol']}"
                        if marker in seen:
                            continue
                        seen.add(marker)
                        if try_add(square):
                            following.append(square)
                frontier = following

        if piece["type"] in {"rook", "queen"}:
            for direction in ORTHO:
                slide_ortho(*direction)
        if piece["type"] in {"bishop", "queen"}:
            for direction in DIAG:
                slide_diag(*direction)
        if piece["type"] == "knight":
            targets = []
            if anchored:
                for d_row, d_col in [(-2, -1), (-2, 1), (2, -1), (2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2)]:
                    if 0 <= row + d_row < N and 0 <= col + d_col < N:
                        targets.append({"face": face, "row": row + d_row, "col": col + d_col})
            else:
                targets = cube_knight(face, row, col)
            for square in targets:
                occupant = self.piece_at(square)
                if not occupant or (not self.allied(army_id, occupant["armyId"]) and (attack_map or occupant["type"] != "king")):
                    add_move(square, bool(occupant), **({"capturedType": occupant["type"]} if occupant else {}))
        if piece["type"] == "king":
            for d_row, d_col in ORTHO + DIAG:
                if anchored:
                    targets = [{"face": face, "row": row + d_row, "col": col + d_col}] if 0 <= row + d_row < N and 0 <= col + d_col < N else []
                else:
                    targets = [next_orthogonal(face, row, col, d_row, d_col)] if (d_row, d_col) in ORTHO else next_diagonal(face, row, col, d_row, d_col)
                for square in targets:
                    occupant = self.piece_at(square)
                    if not occupant or (not self.allied(army_id, occupant["armyId"]) and (attack_map or occupant["type"] != "king")):
                        extra = {"capturedType": occupant["type"]} if occupant else {}
                        if square.get("cornerChoice"):
                            extra["cornerChoice"] = True
                        add_move(square, bool(occupant), **extra)
        if piece["type"] == "pawn":
            forward = piece["forward"]
            if not attack_map and 0 <= row + forward < N:
                one = {"face": face, "row": row + forward, "col": col}
                if not self.piece_at(one):
                    add_move(one)
                    home = 6 if forward == -1 else 1
                    if row == home:
                        two = {"face": face, "row": row + 2 * forward, "col": col}
                        if not self.piece_at(two):
                            add_move(two, double=True, skipped=one)
            for d_col in (-1, 1):
                target_row, target_col = row + forward, col + d_col
                if not (0 <= target_row < N and 0 <= target_col < N):
                    continue
                square = {"face": face, "row": target_row, "col": target_col}
                occupant = self.piece_at(square)
                if attack_map:
                    add_move(square, True)
                elif occupant and not self.allied(army_id, occupant["armyId"]) and occupant["type"] != "king":
                    add_move(square, True, capturedType=occupant["type"])
                else:
                    right = self.en_passant.get(army_id)
                    if right and square_key(**square) == square_key(**right["target"]):
                        add_move(square, True, capturedType="pawn", enPassant=True, captureSquare=right["captureSquare"])
        if not self.classic and anchored and piece["breachReady"] and not attack_map:
            climb = next_orthogonal(face, row, col, piece["forward"], 0)
            if not self.piece_at(climb):
                add_move(climb, climb=True)

        result = list(moves.values())
        if self.classic:
            result = [move for move in result if move["face"] == face and not move.get("climb")]
        if not attack_map and piece["type"] == "pawn":
            army = self.army(piece["armyId"])
            for move in result:
                if move["face"] == piece["homeFace"] and move["row"] == army["gatewayRow"]:
                    move["promotionChoices"] = PROMOTIONS.copy()
        if not attack_map and piece["type"] == "king" and not piece["hasMoved"] and not piece["cubeEnabled"] and col == 4:
            army = self.army(piece["armyId"])
            home_row = 7 if army["side"] == "A" else 0
            if face == army["face"] and row == home_row and not self.in_check(piece["armyId"]):
                self._add_castle(result, piece, face, row, "king", 7, 6, 5, [5, 6], [5, 6])
                self._add_castle(result, piece, face, row, "queen", 0, 2, 3, [1, 2, 3], [3, 2])
        return result

    def _add_castle(self, moves: list[dict[str, Any]], king: dict[str, Any], face: str, row: int, side: str, rook_col: int, destination: int, rook_destination: int, empty_cols: list[int], transit_cols: list[int]) -> None:
        rook = self.board.get(square_key(face, row, rook_col))
        if not rook or rook["type"] != "rook" or rook["armyId"] != king["armyId"] or rook["hasMoved"]:
            return
        if any(self.board.get(square_key(face, row, col)) for col in empty_cols):
            return
        if any(self.is_square_attacked(face, row, col, king["armyId"]) for col in transit_cols):
            return
        moves.append({"face": face, "row": row, "col": destination, "capture": False, "castle": side, "rookFrom": {"face": face, "row": row, "col": rook_col}, "rookTo": {"face": face, "row": row, "col": rook_destination}})

    def is_square_attacked(self, face: str, row: int, col: int, defender_army: str) -> bool:
        for key, piece in self.board.items():
            if self.allied(piece["armyId"], defender_army) or piece["armyId"] in self.eliminated:
                continue
            source = parse_key(key)
            if any(move["face"] == face and move["row"] == row and move["col"] == col for move in self.generate_pseudo(**source, piece=piece, attack_map=True)):
                return True
        return False

    def in_check(self, army_id: str) -> bool:
        king = self.find_king(army_id)
        return self.is_square_attacked(king["face"], king["row"], king["col"], army_id) if king else True

    def legal_moves_at(self, face: str, row: int, col: int) -> list[dict[str, Any]]:
        piece = self.board.get(square_key(face, row, col))
        if not piece or piece["armyId"] in self.eliminated:
            return []
        legal = []
        for target in self.generate_pseudo(face, row, col, piece):
            copy = self.clone()
            copy.apply_move({"from": {"face": face, "row": row, "col": col}, "to": target, "piece": piece["type"]}, record=False)
            if not copy.in_check(piece["armyId"]):
                legal.append(target)
        return legal

    def all_legal_moves(self, army_id: str) -> list[dict[str, Any]]:
        if army_id in self.eliminated:
            return []
        moves = []
        for key, piece in self.board.items():
            if piece["armyId"] != army_id:
                continue
            source = parse_key(key)
            for target in self.legal_moves_at(**source):
                moves.append({"from": source, "to": target, "piece": piece["type"]})
        return moves

    def _move_id(self, move: dict[str, Any]) -> str:
        canonical = json.dumps(move, sort_keys=True, separators=(",", ":"))
        material = f"{self.state_version}|{self.current_army()['id']}|{canonical}"
        return sha256(material.encode("utf-8")).hexdigest()[:24]

    def legal_move_records(self, army_id: str | None = None) -> list[dict[str, Any]]:
        army_id = army_id or self.current_army()["id"]
        records = []
        for raw_move in self.all_legal_moves(army_id):
            choices = raw_move["to"].get("promotionChoices", [])
            variants = choices or [None]
            for choice in variants:
                move = deepcopy(raw_move)
                move["to"].pop("promotionChoices", None)
                if choice:
                    move["to"]["promoteTo"] = choice
                records.append({"move_id": self._move_id(move), "move": move, "notation": self.preview_notation(move)})
        return records

    def public_legal_moves(self, army_id: str | None = None) -> list[dict[str, Any]]:
        return [{"move_id": record["move_id"], **deepcopy(record["move"]), "notation": record["notation"]} for record in self.legal_move_records(army_id)]

    def preview_notation(self, move: dict[str, Any]) -> str:
        source, target = move["from"], move["to"]
        if target.get("castle"):
            return "O-O" if target["castle"] == "king" else "O-O-O"
        if self.classic:
            coordinate = lambda square: f"{chr(65 + square['col'])}{8 - square['row']}"
        else:
            coordinate = lambda square: f"{square['face']}{square['row'] + 1}{chr(65 + square['col'])}"
        suffix = f"={target['promoteTo'][0].upper()}" if target.get("promoteTo") else (" climb" if target.get("climb") else "")
        return f"{move['piece']} {coordinate(source)}-{coordinate(target)}{suffix}"

    def apply_move(self, move: dict[str, Any], record: bool = True) -> dict[str, Any] | None:
        source_key = square_key(**move["from"])
        target_key = square_key(move["to"]["face"], move["to"]["row"], move["to"]["col"])
        piece = self.board.get(source_key)
        if not piece:
            return None
        self.en_passant.pop(piece["armyId"], None)
        capture_square = move["to"].get("captureSquare") if move["to"].get("enPassant") else move["to"]
        capture_key = square_key(capture_square["face"], capture_square["row"], capture_square["col"])
        captured = self.board.get(capture_key)
        del self.board[source_key]
        if move["to"].get("enPassant"):
            self.board.pop(capture_key, None)
        promoted: str | None = None
        if self.classic:
            piece["cubeEnabled"] = False
            piece["breachReady"] = False
            army = self.army(piece["armyId"])
            if piece["type"] == "pawn" and move["to"]["row"] == army["gatewayRow"]:
                promoted = move["to"].get("promoteTo", "queen")
                piece["type"] = promoted if promoted in PROMOTIONS else "queen"
                promoted = piece["type"]
        elif move["to"].get("climb"):
            piece["cubeEnabled"] = True
            piece["breachReady"] = False
        elif not piece["cubeEnabled"]:
            army = self.army(piece["armyId"])
            piece["breachReady"] = move["to"]["face"] == piece["homeFace"] and move["to"]["row"] == army["gatewayRow"]
            if piece["type"] == "pawn" and piece["breachReady"]:
                promoted = move["to"].get("promoteTo", "queen")
                piece["type"] = promoted if promoted in PROMOTIONS else "queen"
                promoted = piece["type"]
        piece["hasMoved"] = True
        self.board[target_key] = piece
        if move["to"].get("castle"):
            rook_from, rook_to = move["to"]["rookFrom"], move["to"]["rookTo"]
            rook_key, rook_target_key = square_key(**rook_from), square_key(**rook_to)
            rook = self.board.pop(rook_key, None)
            if rook:
                rook["hasMoved"] = True
                rook["cubeEnabled"] = False
                rook["breachReady"] = False
                self.board[rook_target_key] = rook
        if move["to"].get("double"):
            rival = next((army for army in self.armies if army["face"] == piece["homeFace"] and army["id"] != piece["armyId"]), None)
            if rival:
                self.en_passant[rival["id"]] = {"target": deepcopy(move["to"]["skipped"]), "captureSquare": {"face": move["to"]["face"], "row": move["to"]["row"], "col": move["to"]["col"]}, "pawnId": piece["id"]}
        result = {"piece": deepcopy(piece), "captured": deepcopy(captured), "promoted": promoted}
        if record:
            entry = {"turn": len(self.history) + 1, "armyId": piece["armyId"], "piece": move.get("piece", piece["type"]), "from": deepcopy(move["from"]), "to": deepcopy(move["to"]), "captured": captured["type"] if captured else None, "promoted": promoted, "climb": bool(move["to"].get("climb")), "breachReady": piece["breachReady"]}
            self.history.append(entry)
            self.last_event = self.format_move(entry)
        return result

    def format_move(self, move: dict[str, Any]) -> str:
        army = self.army(move["armyId"])
        if move["to"].get("castle"):
            notation = "O-O" if move["to"]["castle"] == "king" else "O-O-O"
            return f"{army['commander']} | {notation}" if self.classic else f"{army['commander']} - {army['face']}{army['side']} - {notation}"
        source, target = move["from"], move["to"]
        if self.classic:
            coordinate = lambda square: f"{chr(65 + square['col'])}{8 - square['row']}"
            text = f"{army['commander']} | {move['piece']} {coordinate(source)} -> {coordinate(target)}"
        else:
            coordinate = lambda square: f"{square['face']}{square['row'] + 1}{chr(65 + square['col'])}"
            text = f"{army['commander']} - {army['face']}{army['side']} {move['piece']} {coordinate(source)} -> {coordinate(target)}"
        if move.get("captured"):
            text += f" x {move['captured']}"
        if move.get("promoted"):
            text += f" = {move['promoted']}"
        if move.get("breachReady"):
            text += " - gateway ready"
        if move.get("climb"):
            text += " - CLIMBED"
        return text

    def play_move_id(self, move_id: str, expected_version: int) -> dict[str, Any]:
        if expected_version != self.state_version:
            raise StaleStateError(f"Expected state version {self.state_version}, received {expected_version}")
        record = next((candidate for candidate in self.legal_move_records() if candidate["move_id"] == move_id), None)
        if not record:
            raise GameRuleError("Move is not legal in the current state")
        return self.play(record["move"])

    def play(self, move: dict[str, Any]) -> dict[str, Any]:
        if self.game_over:
            raise GameRuleError("The match is complete")
        moving = self.board.get(square_key(**move["from"]))
        if not moving or moving["armyId"] != self.current_army()["id"]:
            raise GameRuleError("It is not that army's turn")
        was_pawn = moving["type"] == "pawn"
        result = self.apply_move(move)
        if not result:
            raise GameRuleError("Move could not be applied")
        self.halfmove_clock = 0 if was_pawn or result["captured"] else self.halfmove_clock + 1
        self.draw_offer = None
        self.advance_turn()
        if self.classic:
            self._record_position()
        state = self.resolve_turn_start()
        self.state_version += 1
        return {**result, "state": state, "stateVersion": self.state_version}

    def remove_army(self, army_id: str) -> None:
        self.board = {key: piece for key, piece in self.board.items() if piece["armyId"] != army_id}

    def active_teams(self) -> set[str]:
        return {army["team"] for army in self.armies if army["id"] not in self.eliminated}

    def advance_turn(self) -> None:
        attempts = 0
        while attempts <= len(self.armies):
            self.turn_index = (self.turn_index + 1) % len(self.armies)
            attempts += 1
            if self.current_army()["id"] not in self.eliminated:
                return

    def resolve_turn_start(self) -> dict[str, Any]:
        if self.classic:
            army = self.current_army()
            moves, check = self.all_legal_moves(army["id"]), self.in_check(army["id"])
            if not moves:
                self.game_over = True
                if check:
                    victor = next(candidate for candidate in self.armies if candidate["id"] != army["id"])
                    self.winner, self.draw_reason = victor["team"], None
                    self.last_event = f"{self.winner} wins by checkmate."
                    return {"type": "game-over", "message": self.last_event}
                self.winner, self.draw_reason = None, "stalemate"
                self.last_event = "Draw by stalemate."
                return {"type": "draw", "message": self.last_event}
            if self.halfmove_clock >= 100:
                return self._finish_draw("fifty-move", "Draw by the fifty-move rule.")
            if self.position_counts.get(self._position_key(), 0) >= 3:
                return self._finish_draw("threefold-repetition", "Draw by threefold repetition.")
            if self._insufficient_material():
                return self._finish_draw("insufficient-material", "Draw by insufficient material.")
            self.last_event = f"{army['commander']}'s king is in check." if check else f"{army['commander']} to move."
            return {"type": "check" if check else "turn", "message": self.last_event, "moves": len(moves)}
        while not self.game_over:
            army = self.current_army()
            moves, check = self.all_legal_moves(army["id"]), self.in_check(army["id"])
            if moves:
                self.last_event = f"{army['commander']}'s {army['face']}{army['side']} king is in check." if check else f"{army['commander']} - {army['face']}{army['side']} to move."
                return {"type": "check" if check else "turn", "message": self.last_event, "moves": len(moves)}
            self.eliminated.add(army["id"])
            self.remove_army(army["id"])
            reason, teams = ("checkmated" if check else "stalemated"), self.active_teams()
            if len(teams) <= 1:
                self.game_over, self.winner = True, next(iter(teams), None)
                self.last_event = f"{self.winner or 'Nobody'} wins {self.config['label']}!"
                return {"type": "game-over", "message": self.last_event}
            self.last_event = f"{army['commander']}'s {army['face']}{army['side']} army is {reason} and eliminated."
            self.advance_turn()
        return {"type": "game-over", "message": self.last_event}

    def _finish_draw(self, reason: str, message: str) -> dict[str, Any]:
        self.game_over, self.winner, self.draw_reason, self.last_event = True, None, reason, message
        return {"type": "draw", "message": message}

    def _position_key(self) -> str:
        pieces = "|".join(f"{key}:{piece['type']}:{piece['armyId']}:{1 if piece['hasMoved'] else 0}" for key, piece in sorted(self.board.items()))
        rights = "|".join(f"{army}:{square_key(**right['target'])}" for army, right in sorted(self.en_passant.items()))
        return f"{self.current_army()['id']};{pieces};{rights}"

    def _record_position(self) -> int:
        key = self._position_key()
        self.position_counts[key] = self.position_counts.get(key, 0) + 1
        return self.position_counts[key]

    def _insufficient_material(self) -> bool:
        pieces = [(key, piece) for key, piece in self.board.items() if piece["type"] != "king"]
        if any(piece["type"] in {"pawn", "rook", "queen"} for _, piece in pieces):
            return False
        if len(pieces) <= 1:
            return True
        if all(piece["type"] == "bishop" for _, piece in pieces):
            colors = {(parse_key(key)["row"] + parse_key(key)["col"]) % 2 for key, _ in pieces}
            return len(colors) == 1
        return False

    def offer_draw(self, army_id: str) -> dict[str, Any]:
        if self.game_over or army_id != self.current_army()["id"]:
            raise GameRuleError("Only the active army may offer a draw")
        offerer = self.army(army_id)
        required = sorted(team for team in self.active_teams() if team != offerer["team"])
        self.draw_offer = {"offeredBy": army_id, "offeringTeam": offerer["team"], "requiredTeams": required, "acceptedTeams": [offerer["team"]]}
        self.last_event = f"{offerer['commander']} offered a draw."
        self.state_version += 1
        if not required:
            self.agree_draw(army_id)
        return deepcopy(self.draw_offer) if self.draw_offer else {"agreed": True}

    def respond_draw(self, army_id: str, accept: bool) -> dict[str, Any]:
        if not self.draw_offer:
            raise GameRuleError("There is no pending draw offer")
        army = self.army(army_id)
        if not army or army_id in self.eliminated or army["team"] not in self.draw_offer["requiredTeams"]:
            raise GameRuleError("This army cannot vote on the draw offer")
        if not accept:
            self.last_event = f"{army['team']} declined the draw offer."
            self.draw_offer = None
            self.state_version += 1
            return {"accepted": False, "agreed": False, "message": self.last_event}
        accepted = set(self.draw_offer["acceptedTeams"])
        accepted.add(army["team"])
        self.draw_offer["acceptedTeams"] = sorted(accepted)
        if set(self.draw_offer["requiredTeams"]).issubset(accepted):
            result = self.agree_draw(self.draw_offer["offeredBy"])
            return {"accepted": True, "agreed": True, **result}
        self.state_version += 1
        return {"accepted": True, "agreed": False, "drawOffer": deepcopy(self.draw_offer)}

    def agree_draw(self, offered_by: str | None = None) -> dict[str, Any]:
        offerer = self.army(offered_by) if offered_by else None
        self.game_over, self.winner, self.draw_reason = True, None, "agreement"
        self.last_event = f"Draw agreed after {offerer['commander']}'s offer." if offerer else "Draw agreed."
        self.draw_offer = None
        self.state_version += 1
        return {"type": "draw", "reason": "agreement", "message": self.last_event, "stateVersion": self.state_version}

    def resign(self, army_id: str) -> dict[str, Any]:
        if self.game_over or army_id != self.current_army()["id"]:
            raise GameRuleError("Only the active army may resign")
        resigned = self.army(army_id)
        pieces_remain = self.config["kind"] == "ffa"
        self.eliminated.add(army_id)
        if not pieces_remain:
            self.remove_army(army_id)
        self.draw_offer = None
        self.advance_turn()
        teams = self.active_teams()
        if len(teams) <= 1:
            self.game_over, self.winner = True, next(iter(teams), None)
            self.last_event = f"{resigned['commander']} resigned. {self.winner or 'Nobody'} wins {self.config['label']}."
            state = {"type": "game-over", "message": self.last_event}
        else:
            following = self.resolve_turn_start()
            reminder = " Their pieces remain on the board." if pieces_remain else ""
            self.last_event = f"{resigned['commander']} resigned.{reminder} {self.current_army()['commander']} is next."
            state = {"type": "resignation", "message": self.last_event, "next": following}
        self.state_version += 1
        return {"army": deepcopy(resigned), "state": state, "piecesRemain": pieces_remain, "stateVersion": self.state_version}

    def public_state(self, include_legal_moves: bool = False) -> dict[str, Any]:
        state = self.snapshot()
        state["currentArmy"] = deepcopy(self.current_army())
        if include_legal_moves and not self.game_over:
            state["legalMoves"] = self.public_legal_moves()
        return state


def _advancement(piece: dict[str, Any], source: dict[str, Any], target: dict[str, Any]) -> int:
    if piece["cubeEnabled"] or source["face"] != target["face"]:
        return 0
    return source["row"] - target["row"] if piece["forward"] == -1 else target["row"] - source["row"]


def _score_move(game: CubeGame, move: dict[str, Any], style: str, generator: random.Random) -> float:
    piece = game.board[square_key(**move["from"])]
    captured = game.board.get(square_key(move["to"]["face"], move["to"]["row"], move["to"]["col"]))
    copy = game.clone()
    result = copy.apply_move(move, record=False)
    value = (generator.random() - 0.5) * (130 if style == "casual" else 12 if style == "sharp" else 42)
    if captured:
        value += PIECE_VALUE[captured["type"]] * 1.3
    value += _advancement(piece, move["from"], move["to"]) * (32 if piece["type"] == "pawn" else 14)
    if move["to"].get("climb"):
        value += 720
    if result and result["piece"]["breachReady"]:
        value += 360
    if result and result["promoted"]:
        value += 850
    if result and result["piece"]["cubeEnabled"] and move["to"]["face"] != move["from"]["face"]:
        value += 55
    if copy.is_square_attacked(move["to"]["face"], move["to"]["row"], move["to"]["col"], piece["armyId"]):
        value -= PIECE_VALUE[piece["type"]] * (0.72 if style == "sharp" else 0.38)
    for army in copy.armies:
        if not copy.allied(piece["armyId"], army["id"]) and army["id"] not in copy.eliminated and copy.in_check(army["id"]):
            value += 160
    return value


def choose_cpu_move(game: CubeGame, army_id: str, style: str = "standard", generator: random.Random | None = None) -> dict[str, Any] | None:
    generator = generator or random.Random()
    records = game.legal_move_records(army_id)
    if not records:
        return None
    ranked = sorted(records, key=lambda record: _score_move(game, record["move"], style, generator), reverse=True)
    width = min(7 if style == "casual" else 2 if style == "sharp" else 4, len(ranked))
    index = int((generator.random() ** 2) * width)
    return ranked[index]
