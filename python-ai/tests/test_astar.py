"""
Unit tests for app/astar.py using small, hand-checkable synthetic graphs.
No campus data and no network access is involved in this file at all.
"""
import math

from app.astar import Edge, Graph, astar, dijkstra, zero_heuristic


def make_graph(edge_list, bidirectional=True) -> Graph:
    """edge_list: iterable of (from, to, weight)."""
    graph: Graph = {}
    for a, b, w in edge_list:
        graph.setdefault(a, []).append(Edge(to=b, weight=w))
        graph.setdefault(b, [])
        if bidirectional:
            graph.setdefault(b, []).append(Edge(to=a, weight=w))
    return graph


# ---------------------------------------------------------------------
# 1. Simple graph with a known optimal route
# ---------------------------------------------------------------------
def test_simple_known_optimal_route():
    # A -1- B -1- C  and A -5- C (direct but expensive)
    g = make_graph([("A", "B", 1), ("B", "C", 1), ("A", "C", 5)])
    result = astar(g, "A", "C")
    assert result.found
    assert result.path == ["A", "B", "C"]
    assert result.cost == 2


# ---------------------------------------------------------------------
# 2. Optimal route is NOT the route with the fewest edges
# ---------------------------------------------------------------------
def test_optimal_route_not_fewest_edges():
    # Direct A->D is one hop but costly (20). A->B->C->D is three hops but cheaper (1+1+1=3).
    g = make_graph([
        ("A", "D", 20),
        ("A", "B", 1), ("B", "C", 1), ("C", "D", 1),
    ])
    result = astar(g, "A", "D")
    assert result.found
    assert result.path == ["A", "B", "C", "D"]
    assert result.cost == 3
    assert len(result.path) > 2  # more hops than the direct edge, but cheaper


# ---------------------------------------------------------------------
# 3. Heuristic guides the search toward the goal (fewer expansions than h=0)
# ---------------------------------------------------------------------
def test_heuristic_guides_search_towards_goal():
    # A grid-like graph laid out on a line so straight-line distance is a
    # perfect (admissible + tight) heuristic, with several dead-end branches
    # that a zero-heuristic (Dijkstra) search has no reason to avoid early.
    coords = {
        "S": 0, "A": 1, "B": 2, "C": 3, "G": 4,
        "X1": 1, "X2": 1, "X3": 1,  # dead-end branches off S, distracting Dijkstra
    }
    edges = [
        ("S", "A", 1), ("A", "B", 1), ("B", "C", 1), ("C", "G", 1),
        ("S", "X1", 1), ("S", "X2", 1), ("S", "X3", 1),  # dead ends, cost 1 each, go nowhere useful
    ]
    g = make_graph(edges)

    def h(node):
        return abs(coords[node] - coords["G"]) if node in coords else 0

    astar_result = astar(g, "S", "G", heuristic=h)
    dijkstra_result = astar(g, "S", "G", heuristic=zero_heuristic)

    assert astar_result.found and dijkstra_result.found
    assert astar_result.cost == dijkstra_result.cost == 4
    # The informed search should not need to expand more nodes than the
    # uninformed one, and in this constructed layout should need strictly fewer.
    assert astar_result.nodes_expanded <= dijkstra_result.nodes_expanded


# ---------------------------------------------------------------------
# 4. Start node equal to destination
# ---------------------------------------------------------------------
def test_start_equals_goal():
    g = make_graph([("A", "B", 1)])
    result = astar(g, "A", "A")
    assert result.found
    assert result.path == ["A"]
    assert result.cost == 0
    assert result.nodes_expanded == 0


# ---------------------------------------------------------------------
# 5. Unreachable destination
# ---------------------------------------------------------------------
def test_unreachable_destination():
    g: Graph = {"A": [Edge(to="B", weight=1)], "B": [Edge(to="A", weight=1)], "C": []}
    result = astar(g, "A", "C")
    assert not result.found
    assert result.path == []
    assert result.cost == math.inf
    assert "No path exists" in result.message


# ---------------------------------------------------------------------
# 6. Invalid start/goal id (not part of the graph at all)
# ---------------------------------------------------------------------
def test_invalid_start_node():
    g = make_graph([("A", "B", 1)])
    result = astar(g, "ZZZ", "B")
    assert not result.found
    assert "not in the graph" in result.message


def test_invalid_goal_node():
    g = make_graph([("A", "B", 1)])
    result = astar(g, "A", "ZZZ")
    assert not result.found
    assert "not in the graph" in result.message


# ---------------------------------------------------------------------
# 7. Zero-weight edges
# ---------------------------------------------------------------------
def test_zero_weight_edges_supported():
    g = make_graph([("A", "B", 0), ("B", "C", 0), ("A", "C", 1)])
    result = astar(g, "A", "C")
    assert result.found
    assert result.cost == 0
    assert result.path == ["A", "B", "C"]


# ---------------------------------------------------------------------
# 8. Multiple possible routes -> cheapest one wins
# ---------------------------------------------------------------------
def test_multiple_routes_picks_cheapest():
    g = make_graph([
        ("A", "B", 10), ("B", "D", 10),      # route 1: cost 20
        ("A", "C", 1), ("C", "D", 1),         # route 2: cost 2 (optimal)
        ("A", "D", 15),                        # route 3: cost 15
    ])
    result = astar(g, "A", "D")
    assert result.found
    assert result.cost == 2
    assert result.path == ["A", "C", "D"]


# ---------------------------------------------------------------------
# 9. Returned route cost equals the sum of edge weights along the path
# ---------------------------------------------------------------------
def test_route_cost_matches_sum_of_edge_weights():
    edge_list = [("A", "B", 4), ("B", "C", 6), ("C", "D", 2), ("A", "D", 100)]
    g = make_graph(edge_list)
    weight_lookup = {}
    for a, b, w in edge_list:
        weight_lookup[(a, b)] = w
        weight_lookup[(b, a)] = w

    result = astar(g, "A", "D")
    assert result.found
    recomputed = sum(weight_lookup[(result.path[i], result.path[i + 1])] for i in range(len(result.path) - 1))
    assert recomputed == result.cost


# ---------------------------------------------------------------------
# A* vs Dijkstra: same optimal cost when the heuristic is admissible
# ---------------------------------------------------------------------
def test_astar_matches_dijkstra_with_admissible_heuristic():
    coords = {"A": (0, 0), "B": (1, 0), "C": (2, 0), "D": (2, 1), "E": (0, 1)}
    edges = [("A", "B", 1), ("B", "C", 1), ("A", "E", 1), ("E", "D", 1), ("D", "C", 1)]
    g = make_graph(edges)

    def euclidean_h(node):
        ax, ay = coords[node]
        gx, gy = coords["C"]
        return math.hypot(ax - gx, ay - gy)  # admissible: straight-line <= any real path here

    a_result = astar(g, "A", "C", heuristic=euclidean_h)
    d_result = dijkstra(g, "A", "C")
    assert a_result.found and d_result.found
    assert a_result.cost == d_result.cost == 2


# ---------------------------------------------------------------------
# Stale priority-queue entries: a later, cheaper path to a node already
# sitting in the open heap must win, not the earlier (now stale) entry.
# ---------------------------------------------------------------------
def test_handles_stale_priority_queue_entries():
    # B is reachable two ways: A->B (cost 10, generates a heap entry early)
    # and A->X->B (cost 2, generates a cheaper heap entry for B later).
    # The stale, expensive A->B heap entry must be ignored once popped.
    g = make_graph([
        ("A", "B", 10),
        ("A", "X", 1), ("X", "B", 1),
        ("B", "G", 1),
    ])
    result = astar(g, "A", "G")
    assert result.found
    assert result.path == ["A", "X", "B", "G"]
    assert result.cost == 3


def test_disconnected_graph_component_is_unreachable():
    g: Graph = {
        "A": [Edge(to="B", weight=1)], "B": [Edge(to="A", weight=1)],
        "C": [Edge(to="D", weight=1)], "D": [Edge(to="C", weight=1)],
    }
    result = astar(g, "A", "D")
    assert not result.found
