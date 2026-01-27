import { Hono } from 'hono'
import { MidtransService } from '../services/midtrans.service'
import { InvoiceService } from '../services/invoice.service'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import crypto from 'crypto'
import { midtransEnv } from '../config/midtrans'
import { mapMidtransStatusToInvoice } from '../services/midtrans.service'

const midtransRoute = new Hono()

// Inisialisasi layanan dengan injeksi dependensi
const invoiceService = new InvoiceService()
const midtransService = new MidtransService(invoiceService)

// Cache notifikasi yang sudah diproses untuk idempotency
const processedNotifications = new Set<string>()

/**
 * VERIFIKASI TANDA TANGAN
 * 
 * Memverifikasi tanda tangan dari Midtrans untuk keamanan webhook.
 * Wajib diaktifkan untuk lingkungan produksi.
 */
function verifySignature(notification: any, signature: string): boolean {
  if (!midtransEnv.IS_PRODUCTION) return true // Lewati di sandbox
  
  const { order_id, status_code, gross_amount } = notification
  const serverKey = midtransEnv.SERVER_KEY
  
  const signatureKey = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex')
    
  return signatureKey === signature
}

/**
 * PENCATATAN TERSTRUKTUR
 * 
 * Pencatatan yang diperkaya dengan ID transaksi dan durasi untuk pemantauan.
 */
function logRequest(type: 'webhook', data: any, success: boolean, error?: any, duration?: number) {
  const logData = {
    timestamp: new Date().toISOString(),
    type,
    success,
    orderId: data.orderId || data.order_id,
    transactionId: data.transaction_id,
    amount: data.amount || data.gross_amount,
    ...(duration && { duration: `${duration}ms` }),
    ...(error && { error: error.message })
  }
  
  if (success) {
    console.info('MIDTRANS_REQUEST', JSON.stringify(logData))
  } else {
    console.error('MIDTRANS_ERROR', JSON.stringify(logData))
  }
}

/**
 * 💰 VALIDASI ATURAN BISNIS
 * 
 * Validasi pembayaran yang komprehensif dengan aturan bisnis yang ketat.
 */
function validatePaymentRules(invoice: any, notification: any): string | null {
  const invoiceAmount = invoice.amount
  const paidAmount = Number(notification.gross_amount)
  
  // Aturan 1: Jumlah harus sama persis (ketat)
  if (paidAmount !== invoiceAmount) {
    return `Ketidakcocokan jumlah: diharapkan ${invoiceAmount}, diterima ${paidAmount}`
  }
  
  // Aturan 2: Validasi status invoice
  if (invoice.status === InvoiceStatus.PAID) {
    return 'Invoice sudah dibayar - tidak dapat dibayar ulang'
  }
  
  if (invoice.status === InvoiceStatus.EXPIRED) {
    return 'Invoice kedaluwarsa - pembayaran tidak diizinkan'
  }
  
  // Aturan 3: Hanya PENDING dan FAILED yang dapat menerima pembayaran
  if (invoice.status !== InvoiceStatus.PENDING && invoice.status !== InvoiceStatus.FAILED) {
    return `Status invoice tidak valid untuk pembayaran: ${invoice.status}`
  }
  
  return null // Semua validasi berhasil
}

/**
 * 🔍 PEMBANTU VALIDASI
 */
function validateWebhookRequest(notification: any): string | null {
  if (!notification.order_id || !notification.transaction_status) {
    return 'Notifikasi tidak valid: order_id dan transaction_status diperlukan'
  }
  
  if (!notification.transaction_id) {
    return 'Notifikasi tidak valid: transaction_id diperlukan'
  }

  if (!notification.gross_amount) {
    return 'Notifikasi tidak valid: gross_amount diperlukan'
  }
  
  return null
}

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
      return c.json({ success: true, message: 'Sudah diprosesupdatedInvoice' }, 200)
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

    const result = await invoiceService.updateStatusAtomicFromPending(
      notification.order_id,
      newStatus,
      notification
    )

    if (result === 'NOOP') {
      throw new Error('Invoice not in PENDING state')
    }

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