/**
 * Drop-in API client for the VIT Smart Campus React frontend.
 * Copy to src/api/client.ts. Set VITE_API_URL (default http://localhost:4000).
 *
 * The frontend NEVER sends or receives an algorithm name — only places + preferences.
 * (The separate Algorithm Visualizer screen uses `visualizerRun`.)
 */
const BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:4000'
const API = `${BASE}/api/v1`

function clientId(): string {
  try {
    let id = localStorage.getItem('vit-client-id')
    if (!id) { id = 'c_' + crypto.randomUUID().replace(/-/g, ''); localStorage.setItem('vit-client-id', id) }
    return id
  } catch { return 'anonymous' }
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId(), ...(init.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok && !(body && body.status)) throw Object.assign(new Error(body?.error?.message ?? res.statusText), { code: body?.error?.code, status: res.status })
  return body as T
}

export type RoutePreference = 'shortest' | 'fastest' | 'accessible' | 'avoid-stairs'
export interface RouteRequest {
  from?: string            // location id / building id / node id / "current_location"
  to: string               // location id (e.g. "library")
  routePreference?: RoutePreference
  avoidStairs?: boolean; preferLift?: boolean; preferRamp?: boolean; avoidRestricted?: boolean
}
export interface Instruction { step: number; type: string; text: string; fromNodeId: string; toNodeId: string; distanceM: number; durationSec: number }
export interface RouteResponse {
  status: 'ROUTE_FOUND' | 'NO_ROUTE' | 'NO_ROUTE_WITH_PREFERENCES' | 'SAME_LOCATION'
  message?: string
  route?: { distanceM: number; distance: string; estimatedTimeMin: number; estimatedTime: string; path: string[]; waypoints: { nodeId: string; label: string; type: string; x: number; y: number }[]; instructions: Instruction[]; accessibility: Record<string, boolean>; warnings: string[] }
  alternatives?: { distance: string; estimatedTime: string; path: string[] }[]
}

export interface AiRouteResponse {
  from: { label: string; nodeId: string }
  to: { label: string; nodeId: string }
  found: boolean
  start: string
  destination: string
  path: string[]
  path_labels: string[]
  total_cost_m: number | null
  cost_basis: string
  nodes_expanded: number
  nodes_generated: number
  algorithm: string
  heuristic: string
  message?: string | null
  computation_time_ms?: number | null
}

export const api = {
  meta: () => http<any>('/meta'),
  search: (q: string, from?: string, category?: string) => http<any>(`/search?q=${encodeURIComponent(q)}${from ? `&from=${from}` : ''}${category ? `&category=${category}` : ''}`),
  suggest: (q: string) => http<{ suggestions: { id: string; name: string; category: string }[] }>(`/search/suggest?q=${encodeURIComponent(q)}`),
  locations: (filter = 'all', from?: string) => http<any>(`/locations?filter=${filter}${from ? `&from=${from}` : ''}`),
  location: (id: string, from?: string) => http<any>(`/locations/${id}${from ? `?from=${from}` : ''}`),
  reportIncorrect: (id: string, message: string, type = 'wrong_location') => http<any>(`/locations/${id}/report`, { method: 'POST', body: JSON.stringify({ type, message }) }),
  buildings: () => http<any>('/buildings'),
  floors: (buildingId: string) => http<any>(`/buildings/${buildingId}/floors`),
  departments: () => http<any>('/departments'),
  department: (id: string) => http<any>(`/departments/${id}`),
  labs: () => http<any>('/labs'),
  facilities: () => http<any>('/facilities'),
  studentServices: () => http<any>('/student-services'),
  digitalServices: () => http<any>('/digital-services'),
  notifications: () => http<any>('/notifications'),
  nearMe: (from?: string) => http<any>(`/near-me${from ? `?from=${from}` : ''}`),
  mapGraph: () => http<any>('/map/graph'),

  findRoute: (req: RouteRequest) => http<RouteResponse>('/routes', { method: 'POST', body: JSON.stringify(req) }),
  // College AI practical: routes through the Python A* service via the Node proxy at /api/v1/ai/route.
  aiRoute: (from: string, to: string) => http<AiRouteResponse>('/ai/route', { method: 'POST', body: JSON.stringify({ from, to }) }),
  progress: (nodes: string[], currentNodeId: string, routePreference?: RoutePreference) => http<any>('/navigation/progress', { method: 'POST', body: JSON.stringify({ nodes, currentNodeId, routePreference }) }),
  emergencyOptions: () => http<any>('/emergency/options'),
  emergencyRoute: (type: 'nearest_exit' | 'nearest_security' | 'nearest_first_aid' | 'nearest_sick_room' | 'assembly_point', from?: string) => http<any>('/emergency/route', { method: 'POST', body: JSON.stringify({ type, from }) }),

  saved: () => http<any>('/me/saved'),
  save: (id: string) => http<any>(`/me/saved/${id}`, { method: 'PUT' }),
  unsave: (id: string) => http<any>(`/me/saved/${id}`, { method: 'DELETE' }),
  recent: () => http<any>('/me/recent'),
  addRecent: (value: string, type: 'query' | 'location' = 'query') => http<any>('/me/recent', { method: 'POST', body: JSON.stringify({ type, value }) }),

  // Technical section only — NOT part of normal navigation
  visualizerGraph: () => http<any>('/visualizer/graph'),
  visualizerRun: (algorithm: 'bfs' | 'dfs' | 'astar', start: string, goal: string) => http<any>('/visualizer/run', { method: 'POST', body: JSON.stringify({ algorithm, start, goal }) }),
}
