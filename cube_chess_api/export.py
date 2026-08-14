from __future__ import annotations

import csv
from datetime import datetime, timezone
from io import StringIO
import re

from .engine import CubeGame


def _coordinate(square):
    if not square:
        return ""
    return f"{square['face']}{square['row'] + 1}{chr(65 + square['col'])}"


def game_to_csv(game: CubeGame) -> str:
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["Move", "Mode", "Commander", "Army", "Team", "Piece", "From", "To", "Action", "Captured", "Promotion", "Gateway Ready", "Result"])
    final_result = f"{game.winner} wins" if game.winner else "Draw"
    for index, move in enumerate(game.history):
        army = game.army(move["armyId"])
        actions = []
        if move["to"].get("castle"):
            actions.append("castle kingside" if move["to"]["castle"] == "king" else "castle queenside")
        else:
            actions.append("capture" if move.get("captured") else "move")
        if move.get("climb"):
            actions.append("climb")
        if move.get("promoted"):
            actions.append("promotion")
        writer.writerow([
            move.get("turn", index + 1), game.config["label"], army["commander"] if army else move["armyId"], move["armyId"], army["team"] if army else "",
            move["piece"], _coordinate(move["from"]), _coordinate(move["to"]), " + ".join(actions), move.get("captured") or "", move.get("promoted") or "",
            "yes" if move.get("breachReady") else "no", final_result if index == len(game.history) - 1 and game.game_over else "",
        ])
    return "\ufeff" + output.getvalue()


def csv_filename(game: CubeGame) -> str:
    mode = re.sub(r"[^a-z0-9]+", "-", game.config.get("label", "cube-chess").lower()).strip("-")
    day = datetime.now(timezone.utc).date().isoformat()
    return f"{mode}-{day}-{len(game.history)}-moves.csv"
