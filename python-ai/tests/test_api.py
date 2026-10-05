"""
API-level tests for app/main.py using FastAPI's TestClient (starlette
TestClient over httpx), which runs the app in-process — no real network
socket or server process, and no internet access required.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["campus_data_loaded"] is True
    assert body["node_count"] == 13
    assert body["edge_count"] == 23


def test_locations_returns_real_campus_nodes():
    resp = client.get("/api/locations")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    ids = {loc["id"] for loc in body}
    assert "entrance" in ids
    assert "library" in ids


def test_route_found_between_real_locations():
    resp = client.post("/api/route", json={"start": "entrance", "destination": "library"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is True
    assert body["path"][0] == "entrance"
    assert body["path"][-1] == "library"
    assert body["total_cost_m"] > 0
    assert body["nodes_expanded"] >= 1
    assert "A*" in body["algorithm"]


def test_route_same_start_and_destination():
    resp = client.post("/api/route", json={"start": "library", "destination": "library"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is True
    assert body["path"] == ["library"]
    assert body["total_cost_m"] == 0


def test_route_unknown_start_id_returns_422_not_stack_trace():
    resp = client.post("/api/route", json={"start": "not-a-real-place", "destination": "library"})
    assert resp.status_code == 422
    body = resp.json()
    assert "not-a-real-place" in body["detail"]
    assert "Traceback" not in str(body)


def test_route_unknown_destination_id_returns_422():
    resp = client.post("/api/route", json={"start": "entrance", "destination": "not-a-real-place"})
    assert resp.status_code == 422


def test_route_missing_fields_returns_422_validation_error():
    resp = client.post("/api/route", json={"start": "entrance"})
    assert resp.status_code == 422


def test_route_empty_body_returns_422():
    resp = client.post("/api/route", json={})
    assert resp.status_code == 422


def test_route_wrong_types_returns_422():
    resp = client.post("/api/route", json={"start": 123, "destination": True})
    assert resp.status_code == 422


def test_no_stack_trace_leaks_on_error():
    # Force a validation error and confirm the response body stays clean.
    resp = client.post("/api/route", json={"start": "", "destination": ""})
    assert resp.status_code == 422
    assert "File \"" not in resp.text  # no python traceback lines
