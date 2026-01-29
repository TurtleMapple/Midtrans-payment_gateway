import { midtransEnv } from '../config/midtrans'
import { InvoiceService } from './invoice.service'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import crypto from 'crypto';

/**
 * 🔔 MIDTRANS NOTIFICATION INTERFACE
 * 
 * Struktur data yang diterima dari webhook Midtrans
 * setelah customer melakukan pembayaran.
 */

interface MidtransNotification {
  order_id: string              
  transaction_status: string    
  payment_type?: string         
  bank?: string       
  va_number?: string
  status_code: string
  gross_amount: string
  signature_key: string
  [key: string]: unknown        
}

/**
 * VERIFIKASI TANDA TANGAN
 * 
 * Memverifikasi tanda tangan dari Midtrans untuk keamanan webhook.
 * Wajib diaktifkan untuk lingkungan produksi.
 */
export function verifySignature(notification: any, signature: string): boolean {
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
 * 🔍 PEMBANTU VALIDASI
 */
export function validateWebhookRequest(notification: any): string | null {
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
 * 💰 VALIDASI ATURAN BISNIS
 * 
 * Validasi pembayaran yang komprehensif dengan aturan bisnis yang ketat.
 */
export function validatePaymentRules(invoice: any, notification: any): string | null {
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
 * 🔄 FSM GUARD - VALIDASI TRANSISI STATUS
 * 
 * Memastikan transisi status invoice mengikuti aturan finite state machine.
 */
export function isValidStatusTransition(currentStatus: InvoiceStatus, newStatus: InvoiceStatus): boolean {
  const finalStatuses = [InvoiceStatus.PAID, InvoiceStatus.FAILED, InvoiceStatus.EXPIRED];
  if (finalStatuses.includes(currentStatus)) {
    return false;
  }
  return currentStatus === InvoiceStatus.PENDING;
}

/**
 * PENCATATAN TERSTRUKTUR
 * 
 * Pencatatan yang diperkaya dengan ID transaksi dan durasi untuk pemantauan.
 */
export function logRequest(type: 'webhook', data: any, success: boolean, error?: any, duration?: number) {
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

export function mapMidtransStatusToInvoice(transactionStatus: string): InvoiceStatus | null {
  switch (transactionStatus) {
    case 'settlement':
    case 'capture':
      return InvoiceStatus.PAID;
    case 'pending':
      return InvoiceStatus.PENDING;
    case 'expire':
    case 'cancel':
      return InvoiceStatus.EXPIRED;
    case 'deny':
    case 'failure':
      return InvoiceStatus.FAILED;
    default:
      return null;
  }
}

export class MidtransService {
  private invoiceService: InvoiceService
  constructor(invoiceService: InvoiceService) {
    this.invoiceService = invoiceService
  }
}