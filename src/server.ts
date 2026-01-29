import 'dotenv/config'
import { serve } from '@hono/node-server'
import app from './app'
import { initDatabase } from './config/mikro-orm'
import 'reflect-metadata'

const port = Number(process.env.PORT || 3000)

// Initialize database once
let isInitialized = false
const ensureInitialized = async () => {
  if (!isInitialized) {
    await initDatabase()
    console.log("Database Connected")
    isInitialized = true
  }
}

// Lambda handler export
export const handler = async (event: any, context: any) => {
  await ensureInitialized()
  return app.fetch(event, context)
}

// Local development server
const startServer = async () => {
  try {
    await ensureInitialized()

    serve({
        fetch: app.fetch,
        port
    })

    console.log(`✅ Server running on port ${port}`)
  } catch (error) {
    console.error('❌ Failed to start server:', error)
  }
}

// Only start the server if running locally (not in Lambda)
if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  startServer()
}