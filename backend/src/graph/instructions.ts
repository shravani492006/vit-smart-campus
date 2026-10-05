import type { GraphEdge, GraphNode } from '../types.js'

export interface Instruction {
  step: number
  type: 'depart' | 'straight' | 'left' | 'right' | 'u-turn' | 'stairs' | 'lift' | 'ramp' | 'arrive'
  text: string
  fromNodeId: string
  toNodeId: string
  distanceM: number
  durationSec: number
}

const heading = (a: GraphNode, b: GraphNode) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
const norm = (d: number) => { while (d > 180) d -= 360; while (d <= -180) d += 360; return d }

/** Screen coordinates have y pointing down, so a positive heading change is a clockwise (right) turn. */
export function turnBetween(prev: GraphNode, cur: GraphNode, next: GraphNode): 'straight' | 'left' | 'right' | 'u-turn' {
  const d = norm(heading(cur, next) - heading(prev, cur))
  if (Math.abs(d) < 25) return 'straight'
  if (Math.abs(d) > 150) return 'u-turn'
  return d > 0 ? 'right' : 'left'
}

export function buildInstructions(ids: string[], edges: GraphEdge[], nodes: Map<string, GraphNode>, timeSec: (e: GraphEdge) => number): Instruction[] {
  const out: Instruction[] = []
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], a = nodes.get(ids[i])!, b = nodes.get(ids[i + 1])!
    let type: Instruction['type'] = i === 0 ? 'depart' : 'straight'
    let text = ''
    if (e.type === 'staircase') { type = 'stairs'; text = `Take the stairs from ${a.label} to ${b.label}` }
    else if (e.type === 'lift') { type = 'lift'; text = `Take the lift from ${a.label} to ${b.label}` }
    else if (e.type === 'ramp') { type = 'ramp'; text = `Use the ramp towards ${b.label}` }
    else if (i === 0) text = `Start at ${a.label} and head towards ${b.label}`
    else {
      const t = turnBetween(nodes.get(ids[i - 1])!, a, b)
      type = t
      text = t === 'straight' ? `Continue straight to ${b.label}` : t === 'u-turn' ? `Make a U-turn at ${a.label} towards ${b.label}` : `Turn ${t} after ${a.label}, towards ${b.label}`
    }
    out.push({ step: out.length + 1, type, text, fromNodeId: ids[i], toNodeId: ids[i + 1], distanceM: e.distanceM, durationSec: Math.round(timeSec(e)) })
  }
  const last = nodes.get(ids[ids.length - 1])!
  out.push({ step: out.length + 1, type: 'arrive', text: `Arrive at ${last.label} — you have reached your destination`, fromNodeId: last.id, toNodeId: last.id, distanceM: 0, durationSec: 0 })
  return out
}
