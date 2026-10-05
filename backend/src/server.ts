import { createApp } from './app.js'
import { config } from './config/index.js'
import { createContext } from './services/context.js'

const ctx = createContext()
const app = createApp(ctx)
const server = app.listen(config.port, () => console.log(`${config.appName} API listening on :${config.port} (${config.env})`))

const shutdown = () => { ctx.db.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
