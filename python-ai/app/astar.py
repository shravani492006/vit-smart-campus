"""
A* Search Algorithm — implemented from scratch (no third-party search library).

This module is intentionally graph-agnostic: it knows nothing about campus
buildings, JSON files, or FastAPI. It only understands a generic weighted
graph made of:

    Graph = {
        "node_id": [Edge(to="neighbour_id", weight=12.0), ...],
        ...
    }

`campus_graph.py` is responsible for turning the real VIT Smart Campus data
into this shape. `main.py` is responsible for exposing it over HTTP.
Keeping the algorithm free of those concerns makes it easy to unit-test with
small synthetic graphs and easy to explain in a viva.

Evaluation function used throughout:

    f(n) = g(n) + h(n)

    g(n) : the actual accumulated cost from the start node to n
           (sum of real edge weights along the best path found so far).
    h(n) : the heuristic estimate of the remaining cost from n to the goal.
    f(n) : the estimated total cost of the cheapest path through n.

If h(n) is admissible (never overestimates the true remaining cost) and
consistent, A* is guaranteed to return the optimal-cost path, exactly like
Dijkstra's algorithm, but typically expanding fewer nodes because the
heuristic biases the search towards the goal.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import Callable, Dict, Hashable, List, Optional


Node = Hashable


@dataclass(frozen=True)
class Edge:
    """One directed traversal option out of a node."""
    to: Node
    weight: float


Graph = Dict[Node, List[Edge]]
Heuristic = Callable[[Node], float]


@dataclass
class AStarResult:
    """Everything a caller needs: whether a path exists, the path itself,
    its total cost, and simple statistics useful for a report / viva."""
    found: bool
    path: List[Node] = field(default_factory=list)
    cost: float = float("inf")
    nodes_expanded: int = 0
    nodes_generated: int = 0
    message: str = ""


def zero_heuristic(_node: Node) -> float:
    """h(n) = 0 for every node. Making every h(n) 0 turns A* into Dijkstra's
    algorithm: it is trivially admissible (0 never overestimates a
    non-negative remaining cost) and consistent, so optimality is preserved.
    Use this whenever a graph has no coordinate system (or an unreliable
    one) to derive a real estimate from."""
    return 0.0


def astar(
    graph: Graph,
    start: Node,
    goal: Node,
    heuristic: Optional[Heuristic] = None,
) -> AStarResult:
    """
    A* search from `start` to `goal` over `graph`.

    Implementation notes (these map directly to the assignment requirements):

    - Uses `heapq` as the priority queue (open set), ordered by f(n).
    - Tracks g(n) for every node reached so far in `g_score`.
    - Tracks a predecessor for every node in `came_from` to reconstruct the
      route once the goal is popped from the open set.
    - Handles *stale* priority-queue entries: when a cheaper path to a node
      is found, the old (now-stale) heap entry is left in place rather than
      removed (removing arbitrary items from a binary heap is O(n)). Instead,
      every popped entry is checked against the best known g-score for that
      node and against the closed set; stale entries fail that check and are
      skipped for free. This is the standard, textbook-correct way to handle
      "decrease-key" in a heapq-based A*/Dijkstra.
    - Nodes are only expanded once: a `closed` set prevents an already
      finalised node from being processed again, so the search does not
      revisit nodes unnecessarily.
    - `start == goal` is handled up front as a zero-cost, single-node path.
    - An unreachable goal is handled by exhausting the open set and
      returning `found=False` rather than raising an exception or looping
      forever.
    """
    if heuristic is None:
        heuristic = zero_heuristic

    if start not in graph and start != goal:
        return AStarResult(found=False, message=f"Start node '{start}' is not in the graph.")
    if goal not in graph and start != goal:
        return AStarResult(found=False, message=f"Goal node '{goal}' is not in the graph.")

    if start == goal:
        return AStarResult(found=True, path=[start], cost=0.0, nodes_expanded=0, nodes_generated=1)

    g_score: Dict[Node, float] = {start: 0.0}
    came_from: Dict[Node, Node] = {}
    closed: set[Node] = set()

    # Heap entries: (f_score, tie_breaker, node). The tie_breaker is a
    # monotonically increasing counter so that heapq never has to compare
    # two nodes directly (nodes may not be orderable) when f-scores tie.
    counter = 0
    open_heap: List[tuple[float, int, Node]] = []
    heapq.heappush(open_heap, (heuristic(start), counter, start))
    nodes_generated = 1

    while open_heap:
        f_current, _, current = heapq.heappop(open_heap)

        if current in closed:
            # Stale entry: this node was already expanded via a cheaper
            # path. Safe to discard.
            continue
        if current not in g_score:
            # Extra safety net; should not happen given how entries are pushed.
            continue

        closed.add(current)

        if current == goal:
            path = _reconstruct_path(came_from, start, goal)
            return AStarResult(
                found=True,
                path=path,
                cost=g_score[goal],
                nodes_expanded=len(closed),
                nodes_generated=nodes_generated,
            )

        for edge in graph.get(current, []):
            neighbour = edge.to
            if neighbour in closed:
                continue
            tentative_g = g_score[current] + edge.weight
            if tentative_g < g_score.get(neighbour, float("inf")):
                g_score[neighbour] = tentative_g
                came_from[neighbour] = current
                counter += 1
                f_score = tentative_g + heuristic(neighbour)
                heapq.heappush(open_heap, (f_score, counter, neighbour))
                nodes_generated += 1

    return AStarResult(
        found=False,
        nodes_expanded=len(closed),
        nodes_generated=nodes_generated,
        message=f"No path exists between '{start}' and '{goal}'.",
    )


def dijkstra(graph: Graph, start: Node, goal: Node) -> AStarResult:
    """Dijkstra's algorithm, implemented as A* with a zero heuristic.
    Provided so tests can independently cross-check A*'s optimal cost."""
    return astar(graph, start, goal, heuristic=zero_heuristic)


def _reconstruct_path(came_from: Dict[Node, Node], start: Node, goal: Node) -> List[Node]:
    path = [goal]
    cur = goal
    while cur != start:
        cur = came_from[cur]
        path.append(cur)
    path.reverse()
    return path
