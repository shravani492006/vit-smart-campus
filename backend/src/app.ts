import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { config } from './config/index.js'
import { errorHandler, notFound } from './middleware/index.js'
import { adminRoutes } from './routes/admin.js'
import { aiRoutes } from './routes/ai.js'
import { navigationRoutes } from './routes/navigation.js'
import { publicRoutes } from './routes/public.js'
import { userRoutes } from './routes/user.js'
import { visualizerRoutes } from './routes/visualizer.js'
import { createContext, type Ctx } from './services/context.js'

export function createApp(ctx: Ctx = createContext()) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigin.includes('*') ? true : config.corsOrigin, allowedHeaders: ['Content-Type', 'X-Client-Id', 'X-Admin-Key'] }))
  app.use(express.json({ limit: '100kb' }))
  if (config.env !== 'test') {
    app.use((req, res, next) => { const t = Date.now(); res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`)); next() })
  }
  app.use('/api/', rateLimit({ windowMs: 60_000, limit: config.env === 'test' ? 100000 : 300, standardHeaders: true, legacyHeaders: false }))

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptimeSec: Math.round(process.uptime()) }))
  app.get('/ready', (_req, res) => res.json({ status: 'ready', nodes: ctx.campus.nodes().length, locations: ctx.campus.locations().length }))

  const api = express.Router()
  api.use(publicRoutes(ctx))
  api.use(navigationRoutes(ctx))
  api.use('/ai', aiRoutes(ctx))
  api.use(userRoutes(ctx))
  api.use('/visualizer', visualizerRoutes(ctx))
  api.use('/admin', adminRoutes(ctx))
  app.use('/api/v1', api)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
