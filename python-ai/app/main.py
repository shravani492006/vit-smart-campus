"""
FastAPI application for the VIT Smart Campus Python AI Navigation service.

Endpoints:
    GET  /health          -> liveness check
    GET  /api/locations    -> the real campus locations (from graph.nodes.json)
    POST /api/route        -> A* route between two location/node ids

Run with:
    uvicorn app.main:app --reload --port 8000

See python-ai/README.md for full setup and example requests.
"""

from __future__ import annotations

import os
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .astar import astar
from .campus_graph import CampusDataError, CampusGraph

# ---------------------------------------------------------------------------
# Campus data is loaded ONCE at process startup (not per-request) for speed,
# but a fresh CampusGraph.load() call is always cheap enough to redo if a
# test needs an isolated instance — see tests/test_api.py.
# ---------------------------------------------------------------------------

_DATA_DIR_ENV = os.environ.get("CAMPUS_DATA_DIR")

try:
    _campus = CampusGraph.load(_DATA_DIR_ENV)
    _load_error: Optional[str] = None
except CampusDataError as exc:
    # Don't crash on import (so /health still responds and explains why
    # everything else is failing); routes below check `_load_error`.
    _campus = None
    _load_error = str(exc)

app = FastAPI(
    title="VIT Smart Campus - Python AI Navigation Service",
    description="Standalone A*-search campus navigation microservice, built for a college AI practical. "
                "Reuses the real campus graph from the existing Node/TypeScript backend.",
    version="1.0.0",
)

# CORS: this service is normally called server-to-server by the Node backend
# proxy (no browser CORS involved at all). It is opened up to a small list of
# localhost dev origins purely so it can also be queried directly (Swagger UI,
# curl, or a frontend pointed straight at it) during development. Configure
# via FRONTEND_ORIGINS (comma-separated) in production; never falls back to "*".
_default_origins = "http://localhost:5173,http://localhost:3000,http://localhost:4000"
_origins = [o.strip() for o in os.environ.get("FRONTEND_ORIGINS", _default_origins).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RouteRequest(BaseModel):
    start: str = Field(..., min_length=1, description="Starting node/location id, e.g. 'entrance'.")
    destination: str = Field(..., min_length=1, description="Destination node/location id, e.g. 'library'.")


class LocationOut(BaseModel):
    id: str
    label: str
    type: str
    x: float
    y: float
    floor: Optional[str] = None


class RouteResponse(BaseModel):
    found: bool
    start: str
    destination: str
    path: List[str] = Field(default_factory=list)
    path_labels: List[str] = Field(default_factory=list)
    total_cost_m: Optional[float] = None
    cost_basis: str = (
        "Sum of real graph edge distances (distanceM, metres) along the returned path. "
        "This is optimal by graph cost, not a live GPS/geographic shortest-walking-route "
        "guarantee — see README for the heuristic's exact meaning."
    )
    nodes_expanded: int = 0
    nodes_generated: int = 0
    algorithm: str
    heuristic: str
    message: Optional[str] = None
    computation_time_ms: Optional[float] = None


class HealthResponse(BaseModel):
    status: str
    campus_data_loaded: bool
    node_count: int
    edge_count: int
    detail: Optional[str] = None


def _require_campus() -> CampusGraph:
    if _campus is None:
        # 503, not 500: the service itself is fine, its data isn't.
        raise HTTPException(status_code=503, detail=f"Campus data is unavailable: {_load_error}")
    return _campus


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if _campus is None:
        return HealthResponse(status="degraded", campus_data_loaded=False, node_count=0, edge_count=0, detail=_load_error)
    return HealthResponse(
        status="ok",
        campus_data_loaded=True,
        node_count=len(_campus.nodes),
        edge_count=len(_campus.edges),
    )


@app.get("/api/locations", response_model=List[LocationOut])
def list_locations() -> List[LocationOut]:
    campus = _require_campus()
    return [LocationOut(**loc) for loc in campus.location_list()]


@app.post("/api/route", response_model=RouteResponse)
def find_route(req: RouteRequest) -> RouteResponse:
    campus = _require_campus()

    if req.start not in campus.nodes:
        raise HTTPException(status_code=422, detail=f"Unknown start location id: '{req.start}'. See GET /api/locations for valid ids.")
    if req.destination not in campus.nodes:
        raise HTTPException(status_code=422, detail=f"Unknown destination location id: '{req.destination}'. See GET /api/locations for valid ids.")

    graph = campus.to_search_graph(only_open=True)
    heuristic, _used_zero, heuristic_desc = campus.build_heuristic(req.destination, only_open=True)

    t0 = time.perf_counter()
    result = astar(graph, req.start, req.destination, heuristic=heuristic)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    labels = [campus.nodes[n].label for n in result.path]

    return RouteResponse(
        found=result.found,
        start=req.start,
        destination=req.destination,
        path=result.path,
        path_labels=labels,
        total_cost_m=(result.cost if result.found else None),
        nodes_expanded=result.nodes_expanded,
        nodes_generated=result.nodes_generated,
        algorithm="A* (heapq-based, f(n) = g(n) + h(n))",
        heuristic=heuristic_desc,
        message=(None if result.found else f"No open route exists between '{req.start}' and '{req.destination}'."),
        computation_time_ms=round(elapsed_ms, 4),
    )
