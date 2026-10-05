"""
Tests against the ACTUAL VIT Smart Campus data (backend/data/graph.nodes.json
and graph.edges.json), separate from the synthetic-graph algorithm tests in
test_astar.py. No network access required — everything is read from disk.
"""
import math

import pytest

from app.astar import astar
from app.campus_graph import CampusDataError, CampusGraph, _parse_edges, _parse_nodes


@pytest.fixture(scope="module")
def campus() -> CampusGraph:
    return CampusGraph.load()  # auto-discovers backend/data


def test_real_campus_data_loads(campus: CampusGraph):
    assert len(campus.nodes) == 13
    assert len(campus.edges) == 23


def test_real_campus_node_ids_are_unique(campus: CampusGraph):
    ids = [n.id for n in campus.nodes.values()]
    assert len(ids) == len(set(ids))


def test_real_campus_edges_reference_real_nodes(campus: CampusGraph):
    for e in campus.edges:
        assert e.from_id in campus.nodes
        assert e.to_id in campus.nodes


def test_real_campus_edge_weights_are_valid(campus: CampusGraph):
    for e in campus.edges:
        assert isinstance(e.distance_m, float)
        assert e.distance_m >= 0
        assert math.isfinite(e.distance_m)


def test_real_campus_graph_is_fully_connected(campus: CampusGraph):
    """Known/expected property of the real data, confirmed by inspection:
    every one of the 13 nodes is reachable from 'entrance' via open edges."""
    graph = campus.to_search_graph(only_open=True)
    start = "entrance"
    seen = {start}
    stack = [start]
    while stack:
        cur = stack.pop()
        for edge in graph.get(cur, []):
            if edge.to not in seen:
                seen.add(edge.to)
                stack.append(edge.to)
    assert seen == set(campus.nodes.keys())


def test_astar_on_real_campus_data_entrance_to_library(campus: CampusGraph):
    graph = campus.to_search_graph(only_open=True)
    heuristic, used_zero, _desc = campus.build_heuristic("library")
    assert used_zero is False  # real coordinates exist, so a real heuristic should be derived

    result = astar(graph, "entrance", "library", heuristic=heuristic)
    assert result.found
    assert result.path[0] == "entrance"
    assert result.path[-1] == "library"

    # Validate: every consecutive pair in the path is connected by a real
    # edge, and the total cost equals the sum of the CHEAPEST open edge
    # weight between each consecutive pair (the real data has more than one
    # edge between some node pairs, e.g. a staircase vs. a lift between
    # blockC and library, so the minimum is the one A* would use).
    edge_weights: dict[tuple[str, str], list[float]] = {}
    for e in campus.edges:
        if e.status != "open":
            continue
        edge_weights.setdefault((e.from_id, e.to_id), []).append(e.distance_m)
        edge_weights.setdefault((e.to_id, e.from_id), []).append(e.distance_m)
    total = 0.0
    for a, b in zip(result.path, result.path[1:]):
        assert (a, b) in edge_weights, f"No open edge connects '{a}' -> '{b}'"
        total += min(edge_weights[(a, b)])
    assert math.isclose(total, result.cost, rel_tol=1e-9)


def test_astar_matches_dijkstra_cost_on_real_data(campus: CampusGraph):
    """The real heuristic must be admissible: A* and Dijkstra (h=0) must
    agree on the optimal cost for every pair tested."""
    graph = campus.to_search_graph(only_open=True)
    pairs = [("entrance", "library"), ("parking", "blockE"), ("assembly", "blockD"), ("den", "blockA")]
    for start, goal in pairs:
        heuristic, _, _ = campus.build_heuristic(goal)
        a = astar(graph, start, goal, heuristic=heuristic)
        d = astar(graph, start, goal, heuristic=None)  # zero heuristic == Dijkstra
        assert a.found and d.found
        assert math.isclose(a.cost, d.cost, rel_tol=1e-9), f"{start}->{goal}: astar={a.cost} dijkstra={d.cost}"


def test_same_start_and_destination_on_real_data(campus: CampusGraph):
    graph = campus.to_search_graph(only_open=True)
    result = astar(graph, "library", "library")
    assert result.found
    assert result.path == ["library"]
    assert result.cost == 0


# ---------------------------------------------------------------------
# Data-validation failure cases, using small malformed payloads instead of
# the real files (so we don't need to ship broken fixtures on disk).
# ---------------------------------------------------------------------

def test_rejects_duplicate_node_ids():
    with pytest.raises(CampusDataError, match="Duplicate node id"):
        _parse_nodes([
            {"id": "a", "label": "A", "type": "building", "x": 0, "y": 0},
            {"id": "a", "label": "A again", "type": "building", "x": 1, "y": 1},
        ])


def test_rejects_edge_with_unknown_node():
    nodes = _parse_nodes([{"id": "a", "label": "A", "type": "building", "x": 0, "y": 0}])
    with pytest.raises(CampusDataError, match="unknown 'to' node"):
        _parse_edges([
            {"id": "e1", "from": "a", "to": "missing", "distanceM": 10},
        ], valid_node_ids=set(nodes.keys()))


def test_rejects_negative_weight():
    nodes = _parse_nodes([
        {"id": "a", "label": "A", "type": "building", "x": 0, "y": 0},
        {"id": "b", "label": "B", "type": "building", "x": 1, "y": 1},
    ])
    with pytest.raises(CampusDataError, match="invalid weight"):
        _parse_edges([
            {"id": "e1", "from": "a", "to": "b", "distanceM": -5},
        ], valid_node_ids=set(nodes.keys()))


def test_rejects_missing_node_id_field():
    with pytest.raises(CampusDataError, match="missing a valid string 'id'"):
        _parse_nodes([{"label": "No id here", "type": "building", "x": 0, "y": 0}])
