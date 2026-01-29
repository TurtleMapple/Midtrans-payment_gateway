import { MidtransService } from '../services/midtrans.service'
import { InvoiceService } from '../services/invoice.service'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import crypto from 'crypto'
import { midtransEnv } from '../config/midtrans'
import { mapMidtransStatusToInvoice, validateWebhookRequest, validatePaymentRules, 
        verifySignature, isValidStatusTransition, logRequest } from '../services/midtrans.service'
import { Hono } from 'hono'


const midtransRoute = new Hono()
// Inisialisasi layanan dengan injeksi dependensi
const invoiceService = new InvoiceService()
const midtransService = new MidtransService(invoiceService)

// Cache notifikasi yang sudah diproses untuk idempotency
const processedNotifications = new Set<string>()
/**
 * 🔔 PENANGANAN WEBHOOK MIDTRANS - SIAP PRODUKSI
 * 
 * Endpoint untuk menerima notifikasi/callback dari Midtrans.
 * Fitur:
 * - Verifikasi tanda tangan untuk keamanan
 * - Perlindungan idempotency untuk penanganan duplikat
 * - Validasi jumlah yang ketat (harus sama persis)
 * - Penegakan aturan bisnis
 * - Kebijakan pembayaran ulang (hanya PENDING/FAILED)
 * - Pencatatan terstruktur dengan pemantauan durasi
 */
midtransRoute.post('/notification', async (c) => {
  const startTime = Date.now()
  let notification: any = {}
  
  try {
    notification = await c.req.json()
    
    // Penanganan header tanda tangan yang fleksibel
    const signature = c.req.header('x-signature') || c.req.header('x-midtrans-signature') || ''
    
    // ✅ VALIDASI TERPADU
    const validationError = validateWebhookRequest(notification)
    if (validationError) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, false, { message: validationError }, duration)
      return c.json({ error: validationError }, 400)
    }

    // VERIFIKASI TANDA TANGAN (Hanya produksi)
    if (midtransEnv.IS_PRODUCTION && !verifySignature(notification, signature)) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, false, { message: 'Tanda tangan tidak valid' }, duration)
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // 🔄 PEMERIKSAAN IDEMPOTENCY
    const notificationId = `${notification.order_id}_${notification.transaction_id}_${notification.transaction_status}`
    if (processedNotifications.has(notificationId)) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, true, { message: 'Notifikasi duplikat' }, duration)
      return c.json({ success: true, message: 'Sudah diproses' }, 200)
    }

    // 📋 AMBIL INVOICE UNTUK VALIDASI
    const invoice = await invoiceService.getByOrderId(notification.order_id)
    if (!invoice) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, false, { message: 'Invoice tidak ditemukan' }, duration)
      return c.json({ error: 'Invoice tidak ditemukan' }, 404)
    }

    // 💰 VALIDASI ATURAN BISNIS
    const businessRuleError = validatePaymentRules(invoice, notification)
    if (businessRuleError) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, false, { message: businessRuleError }, duration)
      return c.json({ error: businessRuleError }, 400)
    }

    // Proses notifikasi melalui layanan
    const newStatus = mapMidtransStatusToInvoice(notification.transaction_status)
    if (!newStatus) {
      throw new Error(`Unknown transaction status: ${notification.transaction_status}`)
    }

    // 3. FSM GUARD - Validasi transisi status
    if (!isValidStatusTransition(invoice.status, newStatus)) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, true, { message: 'Invalid status transition' }, duration)
      return c.json({ success: true, message: 'Status transition not allowed' }, 200)
    }

    // 4. STATUS-BASED IDEMPOTENCY - Cek status sudah sama
    if (invoice.status === newStatus) {
      const duration = Date.now() - startTime
      logRequest('webhook', notification, true, { message: 'Status already set' }, duration)
      return c.json({ success: true, message: 'Status already set - idempotent' }, 200)
    }

    // 5. ATOMIC CAS
    const result = await invoiceService.updateStatusAtomicFromPending(
      notification.order_id,
      newStatus,
      notification
    )

    // 6. SIDE-EFFECT GATING - Handle NOOP dengan proper response
    if (result === 'NOOP') {
      const duration = Date.now() - startTime
      const correlationId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      console.log('ATOMIC_NOOP', {
        correlationId,
        timestamp: new Date().toISOString(),
        orderId: notification.order_id,
        expectedStatus: 'PENDING',
        newStatus,
        reason: 'Invoice not in PENDING state or race condition'
      })
      
      logRequest('webhook', notification, true, { message: 'Atomic NOOP' }, duration)
      return c.json({ success: true, message: 'No operation performed' }, 200)
    }

    // ✅ AUDIT LOG - Success dengan correlation ID
    const correlationId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.log('ATOMIC_SUCCESS', {
      correlationId,
      timestamp: new Date().toISOString(),
      orderId: notification.order_id,
      statusTransition: `${invoice.status} → ${newStatus}`
    })

    const updatedInvoice = await invoiceService.getByOrderId(notification.order_id)
    
    // Tandai sebagai sudah diproses
    processedNotifications.add(notificationId)
    
    const duration = Date.now() - startTime
    logRequest('webhook', notification, true, undefined, duration)
    return c.json({ 
      success: true, 
      invoice: updatedInvoice,
      processedAt: new Date().toISOString()
    }, 200)

  } catch (error: any) {
    const duration = Date.now() - startTime
    logRequest('webhook', notification, false, error, duration)

    // Tangani error layanan spesifik
    if (error.message.includes('Invoice with orderId') && 
        error.message.includes('not found')) {
      return c.json({ error: 'Invoice tidak ditemukan' }, 404)
    }

    if (error.message.includes('Invalid Status')) {
      return c.json({ error: 'Status pembayaran tidak valid' }, 400)
    }
    
    if (error.message.includes('Database not initialized')) {
      return c.json({ error: 'Layanan tidak tersedia' }, 503)
    }

    return c.json({ 
      error: 'Gagal memproses notifikasi pembayaran',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

export default midtransRoute