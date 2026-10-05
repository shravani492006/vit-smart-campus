import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config/index.js'
import type { Availability, GraphEdge, LocationRecord } from '../types.js'

export interface RecentItem { type: 'query' | 'location'; value: string; at: string }
export interface Report { id: string; locationId: string; type: string; message: string; clientId: string; createdAt: string; status: 'open' | 'resolved' }
export interface Notification { id: string; title: string; body: string; createdAt: string; level: 'info' | 'warning' | 'critical' }

export interface DbState {
  locationOverrides: Record<string, Partial<LocationRecord>>
  customLocations: LocationRecord[]
  edgeOverrides: Record<string, Partial<GraphEdge>>
  availability: Record<string, Availability>
  users: Record<string, { saved: string[]; recent: RecentItem[] }>
  reports: Report[]
  notifications: Notification[] | null // null = use seed
}
const empty = (): DbState => ({ locationOverrides: {}, customLocations: [], edgeOverrides: {}, availability: {}, users: {}, reports: [], notifications: null })

/** Tiny JSON-file store. Swap for Postgres/Mongo later behind the same interface. */
export class Db {
  state: DbState
  private timer: NodeJS.Timeout | null = null
  constructor(private file: string = config.dbPath) {
    this.state = empty()
    if (file !== ':memory:' && fs.existsSync(file)) {
      try { this.state = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) } } catch { /* corrupt file -> start fresh */ }
    }
  }
  save() {
    if (this.file === ':memory:') return
    if (this.timer) return
    this.timer = setTimeout(() => { this.timer = null; this.flush() }, 150)
  }
  flush() {
    if (this.file === ':memory:') return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2))
    fs.renameSync(tmp, this.file)
  }
  user(clientId: string) { return (this.state.users[clientId] ??= { saved: [], recent: [] }) }
}
