import { Hono } from 'hono'
import { InvoiceService } from '../domain/services/invoice.service'
import { apiKeyAuth } from '../middleware/auth.middleware'
import { InvoiceStatus } from '../domain/entities/InvoiceStatus'
import { z } from 'zod'

const invoiceRoute = new Hono()
const processingPaymentLinks = new Set<string>()

// Lazy initialization - service is created only when needed
const getInvoiceService = () => new InvoiceService()

const createPaymentLinkSchema = z.object({
  order_id: z.string().min(1, 'order_id is required')
})

/**
 * 💳 BUAT PEMBAYARAN BARU
 * 
 * Endpoint untuk membuat pembayaran dengan jumlah yang ditentukan.
 * OrderId akan di-generate otomatis oleh sistem.
 * 
 * Request Body:
 * - amount (number): Jumlah pembayaran dalam rupiah, harus > 0
 * 
 * Response Success (201):
 * - id: ID pembayaran di database
 * - orderId: Kode unik pembayaran (auto-generated)
 * - amount: Jumlah pembayaran
 * - status: Status pembayaran (default: 'PENDING')
 * - createdAt: Waktu pembuatan
 * 
 * Error Responses:
 * - 400: Jumlah tidak valid (bukan angka atau <= 0)
 * - 409: Pembayaran dengan orderId sama sudah ada (sangat jarang karena auto-generate)
 * - 500: Error server internal
 */
invoiceRoute.post('/invoices', apiKeyAuth, async (c) => {
  try {
    const body = await c.req.json()
    const { amount } = body

    if (typeof amount !== 'number' || amount <= 0) {
      return c.json({ error: 'Jumlah harus berupa angka positif' }, 400)
    }

    // Auto-generate orderId
    const orderId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const invoice = await getInvoiceService().create(orderId, amount)
    return c.json(invoice, 201)

  } catch (error: any) {
    if (error.message === 'INVOICE_ALREADY_EXISTS') {
      return c.json({ error: 'Pembayaran sudah ada' }, 409)
    }

    return c.json({ error: 'Error server internal' }, 500)
  }
})

/**
 * 🔗 GENERATE PAYMENT LINK
 * 
 * Endpoint untuk membuat payment link Midtrans.
 * Backend mengontrol penuh kapan link dibuat dan membatasi retry.
 */
invoiceRoute.post('/invoices/:id/generate-payment-link', apiKeyAuth, async (c) => {
    try{
      const id = c.req.param('id')
      if (!id || id.trim() === '') {
        return c.json({ error: 'ID invoice tidak valid' }, 400)
      }

      const result = await getInvoiceService().generatePaymentLink(id)

      return c.json({
        paymentLink: result.paymentLink,
        paymentLinkCreatedAt: result.paymentLinkCreatedAt,
        paymentAttemptCount: result.paymentAttemptCount,
        expiresIn: 30 * 60 // 30 menit dalam detik
      }, 200)
      
    } catch (error: any){
      //Error Mapping
        switch (error.message) {
          case 'Invoice Not Found':
            return c.json({ error: 'Invoice tidak ditemukan' }, 404)
          case 'INVOICE_ALREADY_PAID':
            return c.json({ error: 'Invoice sudah lunas' }, 409)
          case 'INVOICE_EXPIRED':
            return c.json({ error: 'Invoice sudah kadaluarsa' }, 409)
            case 'MAX_PAYMENT_ATTEMPTS_REACHED':
              return c.json({ error: 'Maksimal percobaan pembayaran tercapai' }, 409)
          case 'ACTIVE_PAYMENT_LINK_EXISTS':
              return c.json({ error: 'Payment link aktif sudah ada' }, 409)
          default:
              console.error('Payment link generation error:', error)
              return c.json({ error: 'Error server internal' }, 500)

        }
    }
})

/**
 * 🔗 GENERATE PAYMENT LINK (Midtrans Style)
 * 
 * Request Body: { "order_id": "PAY-123..." }
 */
invoiceRoute.post('/v1/payment-links', apiKeyAuth, async (c) => {
  try {
    const body = await c.req.json()
    const { order_id } = createPaymentLinkSchema.parse(body)

    // Mencegah Race Request
    const lockkey = `payment_link_${order_id}`
    if (processingPaymentLinks.has(lockkey)) {
      return c.json({ error: 'Payment link generation is already in progress' }, 429)
    }

    processingPaymentLinks.add(lockkey)

    try {
      // Mengambil Pembayaran by order_id
      const payment = await getInvoiceService().getByOrderId(order_id)
      if (!payment) {
        return c.json({ error: 'Payment not found' }, 404)
      }

      // Cek Status Pembayaran
      if (payment.status === 'PAID') {
        return c.json({ error: 'Payment already paid' }, 409)
      }

      if (payment.status === 'EXPIRED') {
        return c.json({ error: 'Payment expired' }, 409)
      }

      // Cek maksimal retry (3x)
      if (payment.paymentAttemptCount >= 3) {
        return c.json({ error: 'Maximum payment attempts reached' }, 409)
      }

      // Cek apakah sudah ada link aktif
      if (payment.paymentLink && payment.paymentLinkCreatedAt) {
        const linkAge = Date.now() - payment.paymentLinkCreatedAt.getTime()
        const maxAge = 30 * 60 * 1000
        
        if (linkAge < maxAge) {
          return c.json({ 
            payment_url: payment.paymentLink,
            order_id: payment.orderId,
            expires_in: Math.ceil((maxAge - linkAge) / 1000)
          }, 200)
        }
      }

      // Generate payment link
      const updatedPayment = await getInvoiceService().generatePaymentLink(payment.id)

      return c.json({
        payment_url: updatedPayment.paymentLink,
        order_id: updatedPayment.orderId,
        payment_id: `PL-${updatedPayment.id}`,
        expires_in: 30 * 60
      }, 200)

    } finally {
      processingPaymentLinks.delete(lockkey)
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.issues[0].message }, 400)
    }

    console.error('Payment link generation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * 🔍 AMBIL PEMBAYARAN BY ID
 * 
 * Endpoint untuk mengambil detail pembayaran berdasarkan ID.
 * 
 * URL Parameter:
 * - id (number): ID pembayaran yang ingin diambil
 * 
 * Response Success (200):
 * - Semua data pembayaran lengkap
 * 
 * Error Responses:
 * - 400: ID tidak valid (bukan angka atau <= 0)
 * - 404: Pembayaran tidak ditemukan
 * - 503: Database tidak tersedia
 * - 500: Error server internal
 */
invoiceRoute.get('/invoices/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    if (!id || id.trim() === '') {
      return c.json({ error: 'ID pembayaran tidak valid' }, 400)
    }
    
    const invoice = await getInvoiceService().getById(id)
    if (!invoice) return c.json({ error: 'Pembayaran tidak ditemukan' }, 404)
    
    return c.json(invoice)
  } catch (error: any) {
    console.error('Payment fetch error:', error)

    if (error.message === 'Database not initialized') {
        return c.json({ error: 'Layanan tidak tersedia' }, 503)
    }

    return c.json({ error: 'Error server internal' }, 500)
  }
})

/**
 * 🗑️ HAPUS PEMBAYARAN
 * 
 * Endpoint untuk menghapus pembayaran secara soft delete.
 * Pembayaran tidak benar-benar dihapus, hanya ditandai dengan deletedAt.
 * 
 * URL Parameter:
 * - id (number): ID pembayaran yang akan dihapus
 * 
 * Response Success (200):
 * - Pembayaran yang sudah ditandai sebagai dihapus
 * 
 * Error Responses:
 * - 400: ID tidak valid
 * - 401: API key tidak valid
 * - 404: Pembayaran tidak ditemukan
 * - 500: Error server internal
 */
invoiceRoute.delete('/invoices/:id', apiKeyAuth, async (c) => {
  try {
    const id = c.req.param('id')
    
    if (!id || id.trim() === '') {
      return c.json({ error: 'ID pembayaran tidak valid' }, 400)
    }
    
    const invoice = await getInvoiceService().softDelete(id)
    return c.json(invoice)
  } catch (error: any) {
    if (error.message === 'Invoice not found') {
      return c.json({ error: 'Pembayaran tidak ditemukan' }, 404)
    }

    return c.json({ error: 'Error server internal' }, 500)
  }
})

/**
 * 📋 LIST INVOICES - Simple Version
 * 
 * GET /v1/invoices - Minimal list endpoint
 */
invoiceRoute.get('/v1/invoices', async (c) => {
  try {
    const invoices = await getInvoiceService().getAll(50)
    return c.json(invoices)
  } catch (error: any) {
    console.error('List invoices error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})


invoiceRoute.get('/payment/success', async (c) => {
  const orderId = c.req.query('order_id')
  
  if (!orderId) {
    return c.html('<h1>Invalid Payment</h1>')
  }

  try {
    const invoice = await getInvoiceService().getByOrderId(orderId)
    if (!invoice) {
      return c.html('<h1>Payment Not Found</h1>')
    }

    return c.html(`
      <h1>Payment ${invoice.status}</h1>
      <p>Order ID: ${invoice.orderId}</p>
      <p>Amount: Rp ${invoice.amount.toLocaleString()}</p>
      <p>Status: ${invoice.status}</p>
    `)
  } catch (error) {
    return c.html('<h1>Error Processing Payment</h1>')
  }
})

export default invoiceRoute