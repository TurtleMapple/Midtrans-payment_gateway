import { Hono } from 'hono'
import invoiceRoute from './routes/invoice.route'
import callbackRoute from './services/midtrans.service'
import { throttlePolicies } from './middleware/auth.middleware'
import { readFileSync } from 'fs'
import { join } from 'path'
import 'reflect-metadata'

const app = new Hono()

// Health check endpoint
app.get('/health', (c) => {
  return c.text('OK')
})

// Debug endpoint untuk cek routing
app.get('/debug', (c) => {
  return c.json({
    message: 'Server berjalan',
    endpoints: [
      'GET /health',
      'GET /debug', 
      'POST /invoices',
      'POST /invoices/:id/generate-payment-link',
      'GET /invoices/:id',
      'DELETE /invoices/:id',
      'GET /v1/invoices',
      'GET /v1/invoices/:id',
      'POST /v1/payment-links',
      'POST /midtrans/notification',
      'GET /docs',
      'GET /openapi.json'
    ]
  })
})

// Route registration dengan THROTTLING
app.route('/', invoiceRoute)

// CALLBACK dengan throttling khusus
app.use('/midtrans/notification', throttlePolicies.callback)
app.route('/midtrans', callbackRoute)

// OpenAPI JSON endpoint
app.get('/openapi.json', (c) => {
  try {
    const openApiSpec = readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')
    return c.json(JSON.parse(openApiSpec))
  } catch (error) {
    return c.json({ error: 'OpenAPI spec not found' }, 404)
  }
})

// Scalar UI dengan dynamic import
// Scalar UI dengan dynamic import
app.get('/docs', async (c, next) => {
  try {
    const scalarModule = await import('@scalar/hono-api-reference')
    const Scalar = scalarModule.Scalar || scalarModule.default
    
    const scalarHandler = Scalar({
      url: '/openapi.json',
      theme: 'purple',
      pageTitle: 'Payment Gateway API'
    })
    
    return await scalarHandler(c, next)
  } catch (error) {
    console.error('Scalar UI error:', error)
    return c.html(`
      <h1>Payment Gateway API Documentation</h1>
      <p>Scalar UI temporarily unavailable</p>
      <p><a href="/openapi.json">View OpenAPI Spec</a></p>
      <ul>
        <li>GET /health - Health check</li>
        <li>GET /v1/invoices - List invoices</li>
        <li>GET /v1/invoices/:id - Get invoice</li>
        <li>POST /v1/payment-links - Generate payment link</li>
        <li>POST /midtrans/notification - Webhook</li>
      </ul>
    `)
  }
})


// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Page Not Found' }, 404)
})

export default app