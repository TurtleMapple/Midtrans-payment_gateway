import { midtransEnv } from '../config/midtrans'
import { InvoiceService } from './invoice.service'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import { Hono } from 'hono';
import crypto from 'crypto';

const callbackRoute = new Hono();
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

function verifySignature(notification: MidtransNotification): boolean {
  const { order_id, status_code, gross_amount, signature_key } = notification;
  if (!order_id || !status_code || !gross_amount || !signature_key) return false;
  
  const payload = order_id + status_code + gross_amount + midtransEnv.SERVER_KEY;
  const calculated = crypto.createHash('sha512').update(payload).digest('hex');
  return calculated === signature_key;
}

function isValidStatusTransition(currentStatus: InvoiceStatus, newStatus: InvoiceStatus): boolean {
  const finalStatuses = [InvoiceStatus.PAID, InvoiceStatus.FAILED, InvoiceStatus.EXPIRED];
  if (finalStatuses.includes(currentStatus)){
    return false;
  }

  if (currentStatus === InvoiceStatus.PENDING){
    return true
  }
  return false
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

callbackRoute.post('/notification', async (c) => {
  try{
    const body = await c.req.json().catch(() => null)
    if (!body) {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    // 1. VERIFY SIGNATURE (auth)
    if (!verifySignature(body)) {
      console.log('INVALID_SIGNATURE', {
        timestamp: new Date().toISOString(),
        orderId: body.order_id || 'unknown'
      });
      return c.json({ received: true }, 200);
    }

    const invoiceService = new InvoiceService();
    const invoice = await invoiceService.getByOrderId(body.order_id);

    if (!invoice) {
      console.log('INVOICE_NOT_FOUND', {
        timestamp: new Date().toISOString(),
        orderId: body.order_id
      });
      return c.json({ received: true }, 200);
    }

    // 2. MAP STATUS
    const newStatus = mapMidtransStatusToInvoice(body.transaction_status);
    if (!newStatus) {
      console.log('UNKNOWN_TRANSACTION_STATUS', {
        timestamp: new Date().toISOString(),
        orderId: body.order_id,
        status: body.transaction_status
      });
      return c.json({ received: true }, 200);
    }

    // 3. FSM GUARD
    if (!isValidStatusTransition(invoice.status, newStatus)) {
      console.log('INVALID_STATUS_TRANSITION', {
        timestamp: new Date().toISOString(),
        orderId: body.order_id,
        currentStatus: invoice.status,
        newStatus: newStatus
      });
      return c.json({ received: true }, 200);
    }

    // 4. STATUS-BASED IDEMPOTENCY
    if (invoice.status === newStatus) {
      console.log('STATUS_ALREADY_SET', {
        timestamp: new Date().toISOString(),
        orderId: body.order_id,
        status: newStatus,
        reason: 'Idempotent callback'
      });
      return c.json({ received: true }, 200);
    }

    // 5. ATOMIC CAS - TANPA SIDE-EFFECT SEBELUMNYA
    const result = await invoiceService.updateStatusAtomicFromPending(
      body.order_id,
      newStatus,
      body
    )

    // 6. SIDE-EFFECT GATING - HANYA SETELAH TAHU HASIL CAS
    if (result === 'NOOP') {
      console.log('ATOMIC_NOOP', {
        timestamp: new Date().toISOString(),
        orderId: body.order_id,
        expectedStatus: 'PENDING',
        newStatus,
        reason: 'Invoice not in PENDING state or race condition'
      })
      return c.json({ received: true }, 200)
    }

    // HANYA JIKA SUCCESS - BARU BOLEH SIDE-EFFECTS
    const correlationId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // ✅ AUDIT LOG (setelah CAS SUCCESS)
    console.log('ATOMIC_SUCCESS', {
      correlationId,
      timestamp: new Date().toISOString(),
      orderId: body.order_id,
      statusTransition: `PENDING → ${newStatus}`
    })

    // ✅ FUTURE: Emit events, notify systems, etc (setelah CAS SUCCESS)
    // await eventEmitter.emit('invoice.status.changed', { orderId, newStatus })
    // await notificationService.notify(orderId, newStatus)

    return c.json({ received: true }, 200)

  } catch (error) {
    console.error('Callback error:', error)
    return c.json({ received: true }, 200)
  }
})

export default callbackRoute