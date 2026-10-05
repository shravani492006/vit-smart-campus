"""
Loads the REAL VIT Smart Campus graph data (owned by the Node/TypeScript
backend at ``backend/data/graph.nodes.json`` and ``backend/data/graph.edges.json``)
and adapts it into the generic ``Graph`` shape that ``astar.py`` understands.

Design decisions (read before changing anything):

1. This module never writes to, copies, or duplicates the original JSON
   files. It only reads them, at request time via ``load_campus()`` /
   ``CampusGraph.load()``, so the Node backend and this Python service are
   always looking at the exact same source of truth. There is no second
   campus dataset anywhere in this folder.

2. Directedness. Each edge record has a ``from``/``to`` pair, which looks
   directed. However, the existing Node implementation
   (``backend/src/graph/algorithms.ts::buildAdj``) adds *both* directions
   for every edge, i.e. the live application already treats the campus
   graph as undirected (you can always walk a corridor both ways). This
   adapter reproduces that same behaviour for consistency with the real
   app, rather than inventing a new directed interpretation the rest of
   the project does not use. If a genuinely one-way edge is ever added to
   the data with a marker field, this is the one place that would need to
   change.

3. Traversability. Only edges with ``status == "open"`` are added to the
   adjacency list — a "closed" or "blocked" path cannot physically be
   walked, so the AI should not be able to route through it. Preferences
   such as "avoid stairs", "prefer lift", "avoid restricted area" or
   live congestion (features of the existing Node ``RoutingEngine``) are a
   *policy* layer on top of physical traversability, not part of the core
   A* search this practical is about, so they are intentionally left out of
   this simplified Python service. This keeps the Python code small enough
   for a student to explain in a viva while still being real, working
   navigation over the real graph.

4. Edge cost. The cost of an edge is its real ``distanceM`` (metres) — the
   same physical quantity the Node backend uses for its "shortest" routing
   mode. No cost is invented.

5. Heuristic. Node coordinates (``x``, ``y``) are schematic pixel positions
   on the campus map illustration, not GPS/lat-lon coordinates — confirmed
   by inspecting graph.nodes.json (values like x=310, y=390) and comparing
   them against typical building spacing in graph.edges.json's distanceM
   values (30–175 m). Pixels and metres are different, unrelated units, so
   straight-line pixel distance cannot be used directly as a metre
   estimate. The existing Node code (``routing.ts::heuristic``) solves this
   with a scaling trick, which this module reproduces:

       rate = min over every usable edge of (edge.distanceM / pixel_length(edge))
       h(n) = pixel_distance(n, goal) * rate

  ``rate`` is the *cheapest* metres-per-pixel ratio found anywhere in the
  graph. For any actual path from n to the goal with total pixel length L
  and true cost C: every edge on it costs at least `rate` per pixel it
  covers, so C >= rate * L. By the triangle inequality, L is always >= the
  straight-line pixel distance from n to goal. Therefore
  C >= rate * straight_line_pixel_distance(n, goal) = h(n) for every
  possible path — h(n) never overestimates the true remaining cost, so it
  is admissible, and the resulting A* path is optimal by real distance
  (metres), not just by pixel geometry. It is *not* a true walking-distance
  heuristic in the GPS sense (VIT Smart Campus has no GPS data yet); it is
  an admissible estimate derived honestly from the schematic map that the
  application already uses. `main.py` reports this explicitly.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .astar import Edge, Graph


class CampusDataError(ValueError):
    """Raised when the on-disk campus data is missing, malformed, or fails
    validation. Deliberately distinct from generic ValueError so the API
    layer can turn it into a clean HTTP error instead of a stack trace."""


@dataclass(frozen=True)
class CampusNode:
    id: str
    label: str
    type: str
    x: float
    y: float
    floor: Optional[str] = None


@dataclass(frozen=True)
class CampusEdge:
    id: str
    from_id: str
    to_id: str
    distance_m: float
    type: str
    status: str
    restricted: bool
    name: Optional[str] = None


def _find_data_dir(explicit: Optional[str] = None) -> Path:
    """Resolve the backend's data directory robustly, regardless of the
    current working directory the service is started from.

    Resolution order:
      1. An explicit path passed in (used by tests / CAMPUS_DATA_DIR env var).
      2. Walk upward from this file looking for '<ancestor>/backend/data'
         (this is where the real project keeps it: vit-smart-campus/backend/data).
    """
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if not p.is_dir():
            raise CampusDataError(f"CAMPUS_DATA_DIR does not exist or is not a directory: {p}")
        return p

    here = Path(__file__).resolve()
    for ancestor in [here.parent, *here.parents]:
        candidate = ancestor / "backend" / "data"
        if candidate.is_dir():
            return candidate

    raise CampusDataError(
        "Could not locate backend/data next to the python-ai project. "
        "Set the CAMPUS_DATA_DIR environment variable to point at it explicitly."
    )


class CampusGraph:
    """Read-only, validated view over the real campus graph data, plus an
    adapter that produces the generic Graph shape astar.py consumes."""

    def __init__(self, nodes: Dict[str, CampusNode], edges: List[CampusEdge]):
        self.nodes = nodes
        self.edges = edges

    # ---- loading -----------------------------------------------------

    @classmethod
    def load(cls, data_dir: Optional[str] = None) -> "CampusGraph":
        directory = _find_data_dir(data_dir)
        nodes_path = directory / "graph.nodes.json"
        edges_path = directory / "graph.edges.json"

        if not nodes_path.is_file():
            raise CampusDataError(f"Missing file: {nodes_path}")
        if not edges_path.is_file():
            raise CampusDataError(f"Missing file: {edges_path}")

        raw_nodes = _read_json_list(nodes_path)
        raw_edges = _read_json_list(edges_path)

        nodes = _parse_nodes(raw_nodes)
        edges = _parse_edges(raw_edges, valid_node_ids=set(nodes.keys()))

        return cls(nodes=nodes, edges=edges)

    # ---- adapter: real data -> generic Graph for astar.py -------------

    def to_search_graph(self, *, only_open: bool = True) -> Graph:
        """Build the adjacency-list Graph astar.py expects.

        Both directions are added for every usable edge (see module
        docstring, point 2) and the weight is the edge's real distanceM
        (point 4). Edges whose status is not "open" are skipped when
        `only_open` is True (the default) because they cannot physically
        be walked right now.
        """
        graph: Graph = {node_id: [] for node_id in self.nodes}
        for e in self.edges:
            if only_open and e.status != "open":
                continue
            graph[e.from_id].append(Edge(to=e.to_id, weight=e.distance_m))
            graph[e.to_id].append(Edge(to=e.from_id, weight=e.distance_m))
        return graph

    # ---- heuristic ------------------------------------------------------

    def build_heuristic(self, goal_id: str, *, only_open: bool = True):
        """Return (heuristic_fn, used_zero_heuristic, description) for the
        given goal, using the pixel-distance-scaled-by-cheapest-rate trick
        described in the module docstring. Falls back to the zero heuristic
        (Dijkstra behaviour) if the graph has no usable edges to derive a
        rate from, or if the goal node is unknown — this keeps the service
        safe rather than crashing, and lets callers report honestly which
        heuristic actually ran.
        """
        from .astar import zero_heuristic  # local import avoids a cycle at module load time

        zero_desc = (
            "Zero heuristic h(n) = 0 (equivalent to Dijkstra's algorithm) — no usable "
            "edges were available to derive an admissible rate from."
        )
        real_desc = (
            "Admissible schematic-distance heuristic: straight-line pixel distance to the "
            "goal, scaled by the cheapest observed metres-per-pixel rate in the graph. "
            "See campus_graph.py module docstring for the admissibility proof."
        )

        if goal_id not in self.nodes:
            return zero_heuristic, True, zero_desc

        rate = math.inf
        for e in self.edges:
            if only_open and e.status != "open":
                continue
            a, b = self.nodes.get(e.from_id), self.nodes.get(e.to_id)
            if a is None or b is None:
                continue
            pixel_len = math.hypot(a.x - b.x, a.y - b.y)
            if pixel_len > 0:
                rate = min(rate, e.distance_m / pixel_len)

        if not math.isfinite(rate):
            return zero_heuristic, True, zero_desc

        goal = self.nodes[goal_id]

        def heuristic(node_id: str) -> float:
            n = self.nodes.get(node_id)
            if n is None:
                return 0.0
            return math.hypot(n.x - goal.x, n.y - goal.y) * rate

        return heuristic, False, real_desc

    # ---- convenience ----------------------------------------------------

    def location_list(self) -> List[dict]:
        return [
            {"id": n.id, "label": n.label, "type": n.type, "x": n.x, "y": n.y, "floor": n.floor}
            for n in self.nodes.values()
        ]


# ---- parsing / validation helpers --------------------------------------

def _read_json_list(path: Path) -> list:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CampusDataError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(data, list):
        raise CampusDataError(f"{path} must contain a JSON array at the top level.")
    return data


def _parse_nodes(raw_nodes: list) -> Dict[str, CampusNode]:
    nodes: Dict[str, CampusNode] = {}
    for i, raw in enumerate(raw_nodes):
        if not isinstance(raw, dict):
            raise CampusDataError(f"graph.nodes.json[{i}] is not an object.")
        node_id = raw.get("id")
        if not isinstance(node_id, str) or not node_id:
            raise CampusDataError(f"graph.nodes.json[{i}] is missing a valid string 'id'.")
        if node_id in nodes:
            raise CampusDataError(f"Duplicate node id in graph.nodes.json: '{node_id}'.")
        x, y = raw.get("x"), raw.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise CampusDataError(f"Node '{node_id}' has invalid or missing x/y coordinates.")
        nodes[node_id] = CampusNode(
            id=node_id,
            label=raw.get("label", node_id),
            type=raw.get("type", "unknown"),
            x=float(x),
            y=float(y),
            floor=raw.get("floor"),
        )
    return nodes


def _parse_edges(raw_edges: list, valid_node_ids: set) -> List[CampusEdge]:
    edges: List[CampusEdge] = []
    seen_ids: set = set()
    for i, raw in enumerate(raw_edges):
        if not isinstance(raw, dict):
            raise CampusDataError(f"graph.edges.json[{i}] is not an object.")
        edge_id = raw.get("id")
        if not isinstance(edge_id, str) or not edge_id:
            raise CampusDataError(f"graph.edges.json[{i}] is missing a valid string 'id'.")
        if edge_id in seen_ids:
            raise CampusDataError(f"Duplicate edge id in graph.edges.json: '{edge_id}'.")
        seen_ids.add(edge_id)

        from_id, to_id = raw.get("from"), raw.get("to")
        if from_id not in valid_node_ids:
            raise CampusDataError(f"Edge '{edge_id}' references unknown 'from' node: '{from_id}'.")
        if to_id not in valid_node_ids:
            raise CampusDataError(f"Edge '{edge_id}' references unknown 'to' node: '{to_id}'.")

        distance_m = raw.get("distanceM")
        if not isinstance(distance_m, (int, float)) or distance_m < 0 or not math.isfinite(distance_m):
            raise CampusDataError(f"Edge '{edge_id}' has an invalid weight (distanceM={distance_m!r}); must be a finite number >= 0.")

        edges.append(CampusEdge(
            id=edge_id,
            from_id=from_id,
            to_id=to_id,
            distance_m=float(distance_m),
            type=raw.get("type", "walkway"),
            status=raw.get("status", "open"),
            restricted=bool(raw.get("restricted", False)),
            name=raw.get("name"),
        ))
    return edges


def load_campus(data_dir: Optional[str] = None) -> CampusGraph:
    """Small functional convenience wrapper around CampusGraph.load()."""
    return CampusGraph.load(data_dir)
