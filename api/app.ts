/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import materialsRoutes from './routes/materials.js'
import promptsRoutes from './routes/prompts.js'
import generateRoutes from './routes/generate.js'
import projectsRoutes from './routes/projects.js'
import settingsRoutes from './routes/settings.js'
import conversationsRoutes from './routes/conversations.js'
import presetPromptsRoutes from './routes/presetPrompts.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/materials', materialsRoutes)
app.use('/api/prompts', promptsRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/conversations', conversationsRoutes)
app.use('/api/preset-prompts', presetPromptsRoutes)

app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
