import random

import pytest

from cube_chess_api.engine import (
    CubeGame,
    GameRuleError,
    StaleStateError,
    choose_cpu_move,
    make_config,
    next_diagonal,
    next_orthogonal,
    square_key,
)


def find_move(game, from_face, from_row, from_col, to_face, to_row, to_col, promotion=None):
    for record in game.legal_move_records():
        move = record["move"]
        if move["from"] == {"face": from_face, "row": from_row, "col": from_col} and all(
            move["to"][key] == value for key, value in {"face": to_face, "row": to_row, "col": to_col}.items()
        ):
            if promotion is None or move["to"].get("promoteTo") == promotion:
                return record
    raise AssertionError("Expected legal move was not found")


def play_coordinates(game, *coordinates, promotion=None):
    record = find_move(game, *coordinates, promotion=promotion)
    return game.play_move_id(record["move_id"], game.state_version)


@pytest.mark.parametrize(
    ("kind", "size", "armies", "pieces"),
    [
        ("classic", 1, 2, 32),
        ("coalition", 1, 2, 32),
        ("coalition", 6, 12, 192),
        ("teams", 2, 4, 64),
        ("teams", 6, 12, 192),
        ("ffa", 4, 4, 64),
        ("ffa", 12, 12, 192),
    ],
)
def test_all_current_formats_initialize(kind, size, armies, pieces):
    game = CubeGame(make_config(kind, size))
    assert len(game.armies) == armies
    assert len(game.board) == pieces
    assert len(game.public_legal_moves()) == 20


def test_unsupported_free_for_all_size_is_rejected():
    with pytest.raises(GameRuleError):
        make_config("ffa", 5)


def test_structured_move_id_and_stale_state_protection():
    game = CubeGame(make_config("classic", 1))
    move = find_move(game, "D", 6, 4, "D", 4, 4)
    result = game.play_move_id(move["move_id"], 0)
    assert result["stateVersion"] == 1
    assert game.board[square_key("D", 4, 4)]["type"] == "pawn"
    with pytest.raises(StaleStateError):
        game.play_move_id(move["move_id"], 0)


def test_standard_en_passant():
    game = CubeGame(make_config("classic", 1))
    play_coordinates(game, "D", 6, 4, "D", 4, 4)
    play_coordinates(game, "D", 1, 0, "D", 2, 0)
    play_coordinates(game, "D", 4, 4, "D", 3, 4)
    play_coordinates(game, "D", 1, 3, "D", 3, 3)
    move = find_move(game, "D", 3, 4, "D", 2, 3)
    assert move["move"]["to"]["enPassant"] is True
    game.play_move_id(move["move_id"], game.state_version)
    assert square_key("D", 3, 3) not in game.board
    assert game.board[square_key("D", 2, 3)]["armyId"] == "D-A"


def test_standard_castling_and_promotion_choices():
    game = CubeGame(make_config("classic", 1))
    del game.board[square_key("D", 7, 5)]
    del game.board[square_key("D", 7, 6)]
    castle = next(move for move in game.legal_moves_at("D", 7, 4) if move.get("castle") == "king")
    game.apply_move({"from": {"face": "D", "row": 7, "col": 4}, "to": castle, "piece": "king"})
    assert game.board[square_key("D", 7, 6)]["type"] == "king"
    assert game.board[square_key("D", 7, 5)]["type"] == "rook"

    game = CubeGame(make_config("classic", 1))
    pawn = game.board.pop(square_key("D", 6, 0))
    game.board.pop(square_key("D", 0, 0))
    game.board[square_key("D", 1, 0)] = pawn
    choices = [record for record in game.legal_move_records() if record["move"]["from"] == {"face": "D", "row": 1, "col": 0}]
    assert {record["move"]["to"].get("promoteTo") for record in choices} == {"queen", "rook", "bishop", "knight"}
    knight = next(record for record in choices if record["move"]["to"]["promoteTo"] == "knight")
    game.play_move_id(knight["move_id"], game.state_version)
    assert game.board[square_key("D", 0, 0)]["type"] == "knight"


def test_cube_promotion_stays_gateway_ready_and_can_climb():
    game = CubeGame(make_config("ffa", 4))
    pawn = game.board.pop(square_key("D", 6, 0))
    game.board.pop(square_key("D", 0, 0))
    game.board[square_key("D", 1, 0)] = pawn
    promotion = find_move(game, "D", 1, 0, "D", 0, 0, promotion="bishop")
    game.apply_move(promotion["move"])
    promoted = game.board[square_key("D", 0, 0)]
    assert promoted["type"] == "bishop"
    assert promoted["breachReady"] is True
    climbs = [move for move in game.legal_moves_at("D", 0, 0) if move.get("climb")]
    assert len(climbs) == 1
    game.apply_move({"from": {"face": "D", "row": 0, "col": 0}, "to": climbs[0], "piece": "bishop"})
    destination = square_key(climbs[0]["face"], climbs[0]["row"], climbs[0]["col"])
    assert game.board[destination]["cubeEnabled"] is True


def test_cube_edges_preserve_heading_and_corner_branches():
    crossed = next_orthogonal("D", 0, 3, -1, 0)
    assert crossed["face"] != "D"
    corner = next_diagonal("D", 0, 0, -1, -1)
    assert len(corner) == 2
    assert len({move["face"] for move in corner}) == 2


def test_free_for_all_resignation_leaves_inert_pieces_and_skips_turn():
    game = CubeGame(make_config("ffa", 4))
    resigned = game.current_army()["id"]
    count = sum(piece["armyId"] == resigned for piece in game.board.values())
    result = game.resign(resigned)
    assert result["piecesRemain"] is True
    assert sum(piece["armyId"] == resigned for piece in game.board.values()) == count
    assert game.all_legal_moves(resigned) == []
    assert game.current_army()["id"] != resigned
    for _ in range(3):
        game.advance_turn()
    assert game.current_army()["id"] != resigned


def test_draw_offer_requires_all_active_teams():
    game = CubeGame(make_config("ffa", 4))
    game.offer_draw("D-A")
    assert game.respond_draw("D-B", True)["agreed"] is False
    assert game.respond_draw("U-A", True)["agreed"] is False
    result = game.respond_draw("U-B", True)
    assert result["agreed"] is True
    assert game.game_over is True
    assert game.draw_reason == "agreement"


def test_snapshot_round_trip_preserves_authoritative_state():
    game = CubeGame(make_config("teams", 2))
    play_coordinates(game, "D", 6, 4, "D", 4, 4)
    restored = CubeGame.from_snapshot(game.snapshot())
    assert restored.snapshot() == game.snapshot()
    assert restored.public_legal_moves() == game.public_legal_moves()


def test_cpu_always_returns_a_current_legal_move():
    game = CubeGame(make_config("ffa", 4))
    legal_ids = {record["move_id"] for record in game.legal_move_records()}
    selected = choose_cpu_move(game, game.current_army()["id"], "sharp", random.Random(7))
    assert selected["move_id"] in legal_ids
