import fs from 'node:fs'
import path from 'node:path'
import { config, TBV } from '../config/index.js'
import type { Availability, Building, GraphEdge, GraphNode, LocationRecord } from '../types.js'
import { Db } from './db.js'

const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(config.dataDir, f), 'utf8')) as T

export interface Department { id: string; name: string; level: string; focusAreas: string[]; facilities: string[]; note: string | null; locationId: string; professionalTracks?: string[]; honoursAreas?: string[] }

/** Read-through view over seed JSON + runtime overrides stored in Db. */
export class Campus {
  private seedNodes = read<GraphNode[]>('graph.nodes.json')
  private seedEdges = read<GraphEdge[]>('graph.edges.json')
  private seedBuildings = read<Building[]>('buildings.json')
  private seedLocations = read<LocationRecord[]>('locations.json')
  readonly departments = read<Department[]>('departments.json')
  readonly labCategories = read<{ id: string; name: string; departmentId: string; locationId: string }[]>('lab-categories.json')
  readonly digitalServices = read<{ id: string; name: string; description: string | null }[]>('digital-services.json')
  private seedNotifications = read<any[]>('notifications.json')

  constructor(readonly db: Db) {}

  nodes(): GraphNode[] { return this.seedNodes }
  node(id: string) { return this.seedNodes.find((n) => n.id === id) }
  buildings(): Building[] { return this.seedBuildings }
  building(id: string) { return this.seedBuildings.find((b) => b.id === id) }

  edges(): GraphEdge[] {
    return this.seedEdges.map((e) => ({ ...e, ...(this.db.state.edgeOverrides[e.id] ?? {}) }))
  }

  /** Buildings are searchable too; expose them as location-like records. */
  locations(): LocationRecord[] {
    const fromBuildings: LocationRecord[] = this.seedBuildings
      .filter((b) => b.type === 'academic')
      .map((b) => ({
        id: b.id, name: b.name, category: 'buildings', subcategory: null, group: 'ACADEMICS', description: b.description,
        buildingId: b.id, floor: null, room: null, openingHours: null, nodeId: b.nodeId, tags: ['building', 'block', b.shortLabel.toLowerCase(), b.name.toLowerCase()],
        facilities: [], accessibility: { accessible: null, lift: false, ramp: false, accessibleRestroom: false },
        isEmergency: false, emergencyTypes: [], restricted: false, navigable: true, departmentId: null, labDepartmentId: null, verified: false, kind: 'building' as const,
      }))
    const base = [...fromBuildings, ...this.seedLocations, ...this.db.state.customLocations]
    return base.map((l) => ({ ...l, ...(this.db.state.locationOverrides[l.id] ?? {}) }))
  }
  location(id: string) { return this.locations().find((l) => l.id === id) }

  availability(id: string): Availability {
    return this.db.state.availability[id] ?? { status: 'unknown', note: null, updatedAt: null }
  }

  notifications() {
    return this.db.state.notifications ?? this.seedNotifications
  }

  buildingName(id: string | null) { return id ? this.building(id)?.name ?? TBV : TBV }
}
