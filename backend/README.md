# VIT Smart Campus — Backend API

REST API for **VIT SMART CAMPUS** (*Intelligent Campus Navigation for Vidyalankar Institute of Technology*).
Built with Node 20+/22, Express and TypeScript. Powers the React frontend: search, directories, indoor/floor data,
routing, live-navigation progress, emergency mode, saved places/recents, admin data updates, and the separate
Algorithm Visualizer.

## Quick start

```bash
npm install
cp .env.example .env        # set ADMIN_API_KEY
npm run dev                 # http://localhost:4000  (tsx watch)
npm test                    # 58 tests
npm run build && npm start  # production build
```

Docker: `ADMIN_API_KEY=your-secret docker compose up --build` (data persisted in a named volume).

## The key design rule: algorithms are backend-only

```
Frontend sends:  from, to, routePreference, accessibility options
Backend does:    Campus Graph + Routing Engine  →  A* (primary)  +  BFS (reachability / failure reasons)  +  DFS (alternative routes)
Frontend gets:   distance, time, waypoints, turn-by-turn instructions, accessibility info
```

* `POST /api/v1/routes` never accepts or returns an algorithm name (there is a test asserting this).
* BFS / DFS / A\* are exposed **only** under `/api/v1/visualizer/*` for the viva/demo screen.
* A\* uses an **admissible** heuristic computed per request (cheapest cost-per-pixel × straight-line distance), so routes are optimal; a test checks A\* against Dijkstra for every node pair.
* Route preferences map onto edge attributes: `accessible` (only accessible edges), `avoidStairs`, `preferLift`, `preferRamp`, `avoidRestricted`; closed / blocked edges are never used; restricted edges are excluded by default.

## Endpoints (`/api/v1`)

| Area | Endpoint |
|---|---|
| Meta | `GET /meta`, `GET /filters`, `GET /notifications` |
| Search | `GET /search?q=&from=&category=`, `GET /search/suggest?q=` — natural language ("Where is the IT department?", "Nearest washroom", "Where can I print?", "Find an accessible route to the library") |
| Locations | `GET /locations?filter=&buildingId=&q=&from=`, `GET /locations/:id`, `POST /locations/:id/report` (Report Incorrect Location) |
| Buildings | `GET /buildings`, `GET /buildings/:id`, `GET /buildings/:id/floors` |
| Directories | `GET /departments`, `/departments/:id`, `/labs`, `/facilities`, `/student-services`, `/digital-services` |
| Near me | `GET /near-me?from=` |
| Routing | `POST /routes`, `POST /navigation/progress` |
| Emergency | `GET /emergency/options`, `POST /emergency/route` (`nearest_exit`, `nearest_security`, `nearest_first_aid`, `nearest_sick_room`, `assembly_point`) |
| Map | `GET /map/graph` |
| Per-device | `GET/PUT/DELETE /me/saved[/:id]`, `GET/POST/DELETE /me/recent` (header `X-Client-Id`) |
| Visualizer | `GET /visualizer/graph`, `POST /visualizer/run` `{algorithm: bfs\|dfs\|astar, start, goal}` → step trace (visited, open/closed sets, g/h/f, explored edges, final path) |
| Admin (`X-Admin-Key`) | `PATCH/POST /admin/locations`, `PUT /admin/locations/:id/availability`, `GET/PATCH /admin/edges/:id`, `GET/PATCH /admin/reports`, `POST/DELETE /admin/notifications` |
| Ops | `GET /health`, `GET /ready` (outside `/api/v1`) |

`POST /routes` accepts either the frontend's names or the spec's snake_case names:

```json
{ "current_location": "current_location", "destination": "library",
  "route_preference": "accessible",
  "accessibility_preferences": { "avoidStairs": true, "preferLift": true } }
```

Errors are always `{ "error": { "code", "message", "details?" } }`
(`RESTRICTED_AREA` 403, `LOCATION_NOT_MAPPED` 422, `PLACE_NOT_FOUND` 404, `VALIDATION_ERROR` 400, …).

## Data accuracy (spec §51)

`data/*.json` is seed data. Nothing that is unverified is invented:

* Building / floor / room are `null` in the seed and served as **"To be verified"**; opening hours as **"Information unavailable"**; live availability defaults to **"Availability information unavailable"**.
* The campus graph (block positions, edge distances, ramps/stairs/lift edges) is **demo geometry** taken from the frontend design; distances in responses are flagged as demo values (`routeMapping: "demo"`).
* Locations without a graph node (e.g. M.Tech, MMS, Ph.D., V-Print, Amphitheatre, Girls' Common Room) return `422 LOCATION_NOT_MAPPED` instead of a made-up route.
* The Campus Data Centre is `restricted` — hidden from search, never a navigation destination (`403`).

**Updating real data** (no code change, no redeploy): use the admin API.

```bash
# verify a location and attach it to a block / graph node
curl -X PATCH localhost:4000/api/v1/admin/locations/it-dept -H "X-Admin-Key: $KEY" -H 'content-type: application/json' \
  -d '{"buildingId":"block-a","floor":"3","room":"301","nodeId":"blockA","openingHours":"9:00 AM – 5:00 PM","verified":true}'
# live availability
curl -X PUT localhost:4000/api/v1/admin/locations/library/availability -H "X-Admin-Key: $KEY" -H 'content-type: application/json' -d '{"status":"busy","note":"Exam week"}'
# close a path (routes update instantly)
curl -X PATCH localhost:4000/api/v1/admin/edges/e5 -H "X-Admin-Key: $KEY" -H 'content-type: application/json' -d '{"status":"blocked"}'
```

Overrides are stored in `storage/db.json` (atomic writes). To change the graph itself (nodes/edges/buildings), edit
`data/graph.nodes.json`, `data/graph.edges.json`, `data/buildings.json`. `Db`/`Campus` are the only persistence layer,
so swapping the JSON file for Postgres/Mongo later touches just `src/store/*`.

## Frontend integration

Copy `client/api-client.ts` to the frontend (`src/api/client.ts`) and set `VITE_API_URL`. Mapping from the current `App.tsx`:

| Frontend today | Replace with |
|---|---|
| `LOCATIONS`, `BUILDINGS` constants | `api.locations()`, `api.buildings()` |
| `SearchBar` local filtering | `api.search(q)` / `api.suggest(q)` |
| `NavigateScreen` + `RouteScreen` (`runAStar`, hard-coded `prefStats`) | `api.findRoute({from,to,routePreference,…})` → `route.distance`, `route.estimatedTime`, `route.path`, `route.instructions` |
| Emergency screen | `api.emergencyRoute(type)` |
| Saved / Recent | `api.saved()`, `api.save(id)`, `api.recent()` |
| `AlgorithmVisualizer` (`runBFS/DFS/AStar`) | `api.visualizerRun(alg, start, goal)` (keep it a separate technical screen) |

The graph node ids used by the frontend (`entrance`, `blockA` … `den`) are unchanged; the backend adds two nodes
(`central` intersection, `assembly` point) — read them from `GET /map/graph`. Add your dev origin to `CORS_ORIGIN`.

## Project layout

```
data/            seed JSON (graph, buildings, locations, departments, labs, services)
src/graph/       algorithms.ts (BFS/DFS/A*/Dijkstra) · routing.ts (engine, preferences) · instructions.ts (turn-by-turn)
src/services/    search (NLP-lite, synonyms, typo tolerance) · presenter · near-me · emergency · filters
src/routes/      public · navigation · user · admin · visualizer
src/store/       db.ts (JSON persistence) · campus.ts (seed + overrides)
tests/           routing + API tests (vitest, supertest)
```

## Notes / limits

* No GPS or indoor positioning yet: `"current_location"` resolves to `DEFAULT_ORIGIN_NODE` (Main Gate). Send a real location/node id for other starting points.
* Indoor navigation is modelled (floor options, per-floor room lists, stairs/lift/ramp edge types) but multi-floor indoor graphs need verified floor plans.
* Search is deterministic (tokens, synonyms, fuzzy match) — no external AI service; `src/services/search.ts` is the place to plug in an LLM later.
* Anonymous per-device data uses `X-Client-Id`; add real auth before storing anything sensitive.
