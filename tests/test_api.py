from pathlib import Path
import sqlite3
import time

from fastapi.testclient import TestClient
import pytest

from cube_chess_api.config import Settings
from cube_chess_api.main import create_app
from cube_chess_api.storage import Database


def settings_for(path: Path, *, plugin=None, pace=0):
    return Settings(
        database_path=path,
        token_pepper="test-pepper",
        cors_origins=("http://127.0.0.1:4173",),
        agent_pace_ms=pace,
        gpu_agent_plugin=plugin,
        gpu_agent_url=None,
        gpu_agent_bearer_token=None,
    )


@pytest.fixture
def api(tmp_path):
    app = create_app(settings_for(tmp_path / "api.db"))
    created = app.state.database.create_api_key("test-owner")
    with TestClient(app) as client:
        yield app, client, created["api_key"]


def api_headers(key, seat=None):
    headers = {"X-API-Key": key}
    if seat:
        headers["X-Seat-Token"] = seat
    return headers


def create_external_classic(client, key):
    response = client.post(
        "/api/v1/matches",
        headers=api_headers(key),
        json={"mode": "classic", "size": 1, "controllers": {"D-A": "external", "D-B": "external"}},
    )
    assert response.status_code == 201, response.text
    return response.json()["matchId"]


def issue_token(client, key, match_id, army_id):
    response = client.post(f"/api/v1/matches/{match_id}/seats/{army_id}/token", headers=api_headers(key))
    assert response.status_code == 201, response.text
    return response.json()["seatToken"]


def test_health_authentication_capabilities_and_hashed_secrets(api):
    app, client, key = api
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/capabilities").status_code == 401
    capabilities = client.get("/api/v1/capabilities", headers=api_headers(key))
    assert capabilities.status_code == 200
    assert capabilities.json()["protocols"] == ["rest", "websocket"]
    assert capabilities.json()["automation"]["step"] is True
    with sqlite3.connect(app.state.settings.database_path) as connection:
        stored = connection.execute("SELECT key_hash FROM api_keys").fetchone()[0]
    assert key not in stored


def test_rest_match_seat_legal_move_stale_state_and_restart_recovery(api):
    app, client, key = api
    match_id = create_external_classic(client, key)
    second = client.post("/api/v1/matches", headers=api_headers(key), json={"mode": "ffa", "size": 4})
    assert second.status_code == 409

    white = issue_token(client, key, match_id, "D-A")
    black = issue_token(client, key, match_id, "D-B")
    legal = client.get(f"/api/v1/matches/{match_id}/legal-moves", headers=api_headers(key, white))
    assert legal.status_code == 200
    body = legal.json()
    assert body["stateVersion"] == 0
    assert len(body["legalMoves"]) == 20
    moved = client.post(
        f"/api/v1/matches/{match_id}/moves",
        headers=api_headers(key, white),
        json={"move_id": body["legalMoves"][0]["move_id"], "state_version": 0},
    )
    assert moved.status_code == 200
    assert moved.json()["state"]["stateVersion"] == 1

    black_legal = client.get(f"/api/v1/matches/{match_id}/legal-moves", headers=api_headers(key, black)).json()
    stale = client.post(
        f"/api/v1/matches/{match_id}/moves",
        headers=api_headers(key, black),
        json={"move_id": black_legal["legalMoves"][0]["move_id"], "state_version": 0},
    )
    assert stale.status_code == 409
    assert stale.json()["error"] == "StaleStateError"
    valid = client.post(
        f"/api/v1/matches/{match_id}/moves",
        headers=api_headers(key, black),
        json={"move_id": black_legal["legalMoves"][0]["move_id"], "state_version": 1},
    )
    assert valid.status_code == 200

    restored = Database(app.state.settings.database_path, app.state.settings.token_pepper).load_match(match_id)
    assert restored.state_version == 2
    assert len(restored.history) == 2
    events = client.get(f"/api/v1/matches/{match_id}/events", headers=api_headers(key)).json()["events"]
    assert [event["type"] for event in events].count("move.played") == 2


def test_websocket_snapshot_poll_and_move_submission(api):
    _, client, key = api
    match_id = create_external_classic(client, key)
    white = issue_token(client, key, match_id, "D-A")
    with client.websocket_connect(f"/ws/v1/matches/{match_id}?api_key={key}&seat_token={white}") as socket:
        snapshot = socket.receive_json()
        assert snapshot["type"] == "snapshot"
        legal = snapshot["payload"]["state"]["legalMoves"]
        socket.send_json({"type": "move.submit", "move_id": legal[0]["move_id"], "state_version": 0})
        assert socket.receive_json()["type"] == "move.played"
        socket.send_json({"type": "ping"})
        assert socket.receive_json() == {"type": "pong"}


def test_creator_seat_scope_and_free_for_all_resignation(api):
    _, client, key = api
    created = client.post(
        "/api/v1/matches",
        headers=api_headers(key),
        json={"mode": "ffa", "size": 4, "controllers": {"D-A": "external", "D-B": "external", "U-A": "external", "U-B": "external"}},
    )
    match_id = created.json()["matchId"]
    white = issue_token(client, key, match_id, "D-A")
    before = client.get(f"/api/v1/matches/{match_id}", headers=api_headers(key)).json()["state"]
    count = sum(piece["armyId"] == "D-A" for piece in before["board"].values())
    resigned = client.post(f"/api/v1/matches/{match_id}/resign", headers=api_headers(key, white))
    assert resigned.status_code == 200
    state = resigned.json()["state"]
    assert "D-A" in state["eliminated"]
    assert sum(piece["armyId"] == "D-A" for piece in state["board"].values()) == count
    assert state["currentArmy"]["id"] == "D-B"


def test_server_hosted_gpu_plugin_takes_a_legal_turn(tmp_path):
    app = create_app(settings_for(tmp_path / "gpu.db", plugin="tests.gpu_plugin:choose_move", pace=1))
    created = app.state.database.create_api_key("gpu-owner")
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/matches",
            headers=api_headers(created["api_key"]),
            json={"mode": "classic", "size": 1, "controllers": {"D-A": "gpu", "D-B": "external"}},
        )
        assert response.status_code == 201
        match_id = response.json()["matchId"]
        deadline = time.monotonic() + 3
        state = response.json()["state"]
        while state["stateVersion"] == 0 and time.monotonic() < deadline:
            time.sleep(0.02)
            state = client.get(f"/api/v1/matches/{match_id}", headers=api_headers(created["api_key"])).json()["state"]
        assert state["stateVersion"] == 1
        assert state["currentArmy"]["id"] == "D-B"
        assert len(state["history"]) == 1


def test_api_key_is_required_even_when_a_seat_token_is_present(api):
    _, client, key = api
    match_id = create_external_classic(client, key)
    white = issue_token(client, key, match_id, "D-A")
    assert client.get(f"/api/v1/matches/{match_id}", headers={"X-Seat-Token": white}).status_code == 401
    assert client.get(f"/api/v1/matches/{match_id}/events", headers={"X-Seat-Token": white}).status_code == 401
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/v1/matches/{match_id}?seat_token={white}") as socket:
            socket.receive_json()


def test_creator_can_change_controllers_and_automation_settings(api):
    _, client, key = api
    match_id = create_external_classic(client, key)
    changed = client.post(f"/api/v1/matches/{match_id}/seats/D-A/controller", headers=api_headers(key), json={"controller": "cpu"})
    assert changed.status_code == 200, changed.text
    assert next(army for army in changed.json()["state"]["armies"] if army["id"] == "D-A")["controller"] == "cpu"
    paused = client.post(f"/api/v1/matches/{match_id}/automation", headers=api_headers(key), json={"action": "pause"})
    assert paused.status_code == 200
    assert paused.json()["automation"]["paused"] is True
    pace = client.post(f"/api/v1/matches/{match_id}/automation", headers=api_headers(key), json={"action": "set-pace", "pace_ms": 1250})
    style = client.post(f"/api/v1/matches/{match_id}/automation", headers=api_headers(key), json={"action": "set-style", "cpu_style": "sharp"})
    assert pace.json()["automation"]["paceMs"] == 1250
    assert style.json()["automation"]["cpuStyle"] == "sharp"


def test_paused_cpu_match_advances_exactly_one_move_when_stepped(tmp_path):
    app = create_app(settings_for(tmp_path / "step.db", pace=50))
    created = app.state.database.create_api_key("step-owner")
    key = created["api_key"]
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/matches",
            headers=api_headers(key),
            json={"mode": "classic", "size": 1, "controllers": {"D-A": "cpu", "D-B": "cpu"}},
        )
        match_id = response.json()["matchId"]
        client.post(f"/api/v1/matches/{match_id}/automation", headers=api_headers(key), json={"action": "pause"})
        before = client.get(f"/api/v1/matches/{match_id}", headers=api_headers(key)).json()["state"]["stateVersion"]
        stepped = client.post(f"/api/v1/matches/{match_id}/automation", headers=api_headers(key), json={"action": "step"})
        assert stepped.status_code == 200
        deadline = time.monotonic() + 2
        state = stepped.json()["state"]
        while state["stateVersion"] == before and time.monotonic() < deadline:
            time.sleep(0.02)
            state = client.get(f"/api/v1/matches/{match_id}", headers=api_headers(key)).json()["state"]
        assert state["stateVersion"] == before + 1
        time.sleep(0.08)
        stable = client.get(f"/api/v1/matches/{match_id}", headers=api_headers(key)).json()["state"]
        assert stable["stateVersion"] == before + 1


def test_csv_export_contains_move_coordinates(api):
    _, client, key = api
    match_id = create_external_classic(client, key)
    white = issue_token(client, key, match_id, "D-A")
    legal = client.get(f"/api/v1/matches/{match_id}/legal-moves", headers=api_headers(key, white)).json()
    moved = client.post(
        f"/api/v1/matches/{match_id}/moves",
        headers=api_headers(key, white),
        json={"move_id": legal["legalMoves"][0]["move_id"], "state_version": 0},
    )
    assert moved.status_code == 200
    exported = client.get(f"/api/v1/matches/{match_id}/export.csv", headers=api_headers(key))
    assert exported.status_code == 200
    assert "text/csv" in exported.headers["content-type"]
    assert "attachment;" in exported.headers["content-disposition"]
    assert "Move,Mode,Commander,Army,Team,Piece,From,To" in exported.text
    assert "D-A" in exported.text
