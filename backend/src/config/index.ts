import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/** Project root = nearest parent containing package.json (works from src/ and from dist/src/). */
function findRoot(dir: string): string {
  while (!fs.existsSync(path.join(dir, 'package.json')) && path.dirname(dir) !== dir) dir = path.dirname(dir)
  return dir
}
const root = findRoot(path.dirname(fileURLToPath(import.meta.url)))

export const config = {
  port: Number(process.env.PORT ?? 4000),
  env: process.env.NODE_ENV ?? 'development',
  corsOrigin: (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim()),
  adminKey: process.env.ADMIN_API_KEY ?? '',
  dbPath: process.env.DB_PATH ?? path.join(root, 'storage', 'db.json'),
  dataDir: process.env.DATA_DIR ?? path.join(root, 'data'),
  walkSpeed: Number(process.env.WALK_SPEED_MPS ?? 1.3),
  defaultOriginNode: process.env.DEFAULT_ORIGIN_NODE ?? 'entrance',
  appName: 'VIT SMART CAMPUS',
  subtitle: 'Intelligent Campus Navigation for Vidyalankar Institute of Technology',
  institute: 'Vidyalankar Institute of Technology (VIT), Mumbai, Maharashtra, India',
}
export const TBV = 'To be verified'
export const UNAVAILABLE = 'Information unavailable'
