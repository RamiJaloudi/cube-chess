def choose_move(*, state, legal_moves, army):
    assert state["currentArmy"]["id"] == army["id"]
    return legal_moves[0]["move_id"]
