import 'dotenv/config'
import { serve } from '@hono/node-server'
import app from './app'
import { initDatabase } from './config/mikro-orm'
import 'reflect-metadata'

const port = Number(process.env.PORT || 3000)

const startServer = async () => {
  try {
    await initDatabase()
    console.log("Database Connected")

    serve({ 
        fetch: app.fetch, 
        port 
    })
    
    console.log(`✅ Server running on port ${port}`)
  } catch (error) {
    console.error('❌ Failed to start server:', error)
  }
}

startServer()