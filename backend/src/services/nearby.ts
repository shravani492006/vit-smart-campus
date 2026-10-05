import type { LocationRecord } from '../types.js'
import type { Ctx } from './context.js'
import { presentLocation, publicLocations, type Origin } from './presenter.js'

const KINDS: { key: string; label: string; test: (l: LocationRecord) => boolean }[] = [
  { key: 'canteen', label: 'Canteen', test: (l) => l.category === 'food' && l.tags.includes('canteen') },
  { key: 'washroom', label: 'Washroom', test: (l) => l.tags.includes('washroom') && l.category === 'utilities' },
  { key: 'library', label: 'Library', test: (l) => l.id === 'library' },
  { key: 'drinking-water', label: 'Drinking Water', test: (l) => l.tags.includes('drinking water') },
  { key: 'lift', label: 'Lift', test: (l) => l.accessibility.lift && l.category === 'accessibility' },
  { key: 'first-aid', label: 'First Aid', test: (l) => l.id === 'first-aid' },
]

export function nearMe(ctx: Ctx, origin: Origin) {
  const pool = publicLocations(ctx).filter((l) => l.nodeId)
  const items = KINDS.map((k) => {
    const cands = pool.filter(k.test).filter((l) => ctx.campus.availability(l.id).status !== 'closed' && ctx.campus.availability(l.id).status !== 'temporarily_closed' && origin.distM.has(l.nodeId!))
    cands.sort((a, b) => origin.distM.get(a.nodeId!)! - origin.distM.get(b.nodeId!)!)
    const l = cands[0]
    return l ? { ...(presentLocation(ctx, l, origin) as object), nearKind: k.key, label: k.label } : null
  }).filter(Boolean) as unknown as { distanceM: number }[]
  return items.sort((a, b) => a.distanceM - b.distanceM)
}
