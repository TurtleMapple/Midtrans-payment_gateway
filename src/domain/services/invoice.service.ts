import { Invoice } from '../entities/InvoiceEntity'
import { InvoiceStatus } from '../entities/InvoiceStatus'
import { IInvoiceRepository } from '../repositories/IInvoiceRepository'
import { createInvoiceRepository } from '../repositories/RepositoryFactory'
import { midtransEnv } from '../../config/midtrans'

interface MidtransPaymentLinkResponse {
  payment_url: string
  order_id: string
  payment_id: string
}

/**
 * INVOICE SERVICE (SOLID Version)
 *
 * Refactored service dengan SOLID principles:
 * - Single Responsibility: Business logic only, no direct DB access
 * - Open/Closed: Extend behavior tanpa modify core
 * - Liskov Substitution: Work dengan any IInvoiceRepository implementation
 * - Interface Segregation: Depend on focused repository interface
 * - Dependency Inversion: Depend on abstraction (IInvoiceRepository), not concrete class
 *
 * Architecture Pattern: Service Layer + Repository Pattern
 * - Service: Business logic, validation, external API calls
 * - Repository: Data access abstraction
 * - Benefits: Testable, maintainable, database-agnostic
 */
export class InvoiceService {
  private readonly repository: IInvoiceRepository

  /**
   * Constructor dengan Dependency Injection
   * Jika tidak ada repository, gunakan default dari factory
   */
  constructor(repository?: IInvoiceRepository) {
    this.repository = repository ?? createInvoiceRepository()
  }

  /**
   * AMBIL SEMUA INVOICES
   */
  async getAll(limit: number = 50): Promise<Invoice[]> {
    return await this.repository.findAll({
      limit,
      orderBy: { createdAt: 'DESC' },
    })
  }

  /**
   * BUAT INVOICE BARU
   */
  async create(orderId: string, amount: number): Promise<Invoice> {
    return await this.repository.create(orderId, amount)
  }

  /**
   * GENERATE PAYMENT LINK
   *
   * Business logic untuk generate Midtrans payment link.
   * Menggunakan repository untuk database operations.
   */
  async generatePaymentLink(id: string): Promise<Invoice> {
    // Step 1: Validate dan lock invoice
    let invoice: Invoice | null = null

    await this.repository.transaction(async (txRepo) => {
      invoice = await txRepo.findById(id)
      if (!invoice) {
        throw new Error('Invoice Not Found')
      }

      if (invoice.status === InvoiceStatus.PAID) {
        throw new Error('INVOICE_ALREADY_PAID')
      }

      if (invoice.status === InvoiceStatus.EXPIRED) {
        throw new Error('INVOICE_EXPIRED')
      }

      if (invoice.paymentAttemptCount >= 3) {
        throw new Error('MAX_PAYMENT_ATTEMPTS_REACHED')
      }

      if (invoice.paymentLink && invoice.paymentLinkCreatedAt) {
        const linkAge = Date.now() - invoice.paymentLinkCreatedAt.getTime()
        const maxAge = 30 * 60 * 1000

        if (linkAge < maxAge) {
          throw new Error('ACTIVE_PAYMENT_LINK_EXISTS')
        }
      }

      // Mark as in-progress
      invoice.paymentAttemptCount = (invoice.paymentAttemptCount || 0) + 1
      invoice.paymentLinkCreatedAt = new Date()
      await txRepo.flush()
    })

    try {
      // Step 2: Call Midtrans API (outside transaction)
      const midtransOrderId = `${invoice!.orderId.substring(0, 25)}-${invoice!.paymentAttemptCount}`

      const payload = {
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: invoice!.amount,
        },
        usage_limit: 1,
        expiry: {
          duration: 30,
          unit: 'minutes',
        },
        finish_redirect_url: `https://mansur.my.id/payment/success?order_id=${invoice!.orderId}`,
      }

      const midtransUrl = midtransEnv.IS_PRODUCTION
        ? 'https://api.midtrans.com/v1/payment-links'
        : 'https://api.sandbox.midtrans.com/v1/payment-links'

      const response = await fetch(midtransUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(midtransEnv.SERVER_KEY + ':').toString('base64')}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Midtrans API error: ${response.status} - ${errorData}`)
      }

      const paymentLinkData = (await response.json()) as MidtransPaymentLinkResponse

      // Step 3: Update dengan hasil API
      return await this.repository.transaction(async (txRepo) => {
        const updatedInvoice = await txRepo.findById(id)
        if (!updatedInvoice) {
          throw new Error('Invoice Not Found')
        }

        updatedInvoice.paymentLink = paymentLinkData.payment_url
        await txRepo.flush()

        console.info(
          `Payment link generated for invoice ${updatedInvoice.orderId}: ${paymentLinkData.payment_url}`
        )

        return updatedInvoice
      })
    } catch (error) {
      // Clear timestamp to mark as failed
      await this.repository.transaction(async (txRepo) => {
        const failedInvoice = await txRepo.findById(id)
        if (failedInvoice) {
          failedInvoice.paymentLinkCreatedAt = null as any
          await txRepo.flush()
        }
      })

      console.error('Failed to generate payment link:', error)
      throw error
    }
  }

  /**
   * SOFT DELETE INVOICE
   */
  async softDelete(id: string): Promise<Invoice> {
    return await this.repository.softDelete(id)
  }

  /**
   * AMBIL INVOICE BY ID
   */
  async getById(id: string): Promise<Invoice | null> {
    return await this.repository.findById(id)
  }

  /**
   * AMBIL INVOICE BY ORDER ID
   */
  async getByOrderId(orderId: string): Promise<Invoice | null> {
    return await this.repository.findByOrderId(orderId)
  }

  /**
   * UPDATE STATUS INVOICE
   */
  async updateStatus(id: string, status: InvoiceStatus, paymentData?: any): Promise<Invoice> {
    return await this.repository.updateStatus(id, status, paymentData)
  }

  /**
   * UPDATE STATUS BY ORDER ID
   */
  async updateStatusByOrderId(
    orderId: string,
    status: InvoiceStatus,
    paymentData?: any
  ): Promise<Invoice> {
    return await this.repository.updateStatusByOrderId(orderId, status, paymentData)
  }

  /**
   * HANDLE MIDTRANS CALLBACK
   */
  async handleMidtransCallback(
    orderId: string,
    transactionStatus: string,
    rawResponse: any
  ): Promise<Invoice> {
    return await this.repository.transaction(async (txRepo) => {
      // 1. Validate input
      if (!orderId || !transactionStatus) {
        throw new Error('INVALID_CALLBACK_DATA')
      }

      // 2. Get invoice with lock
      const invoice = await txRepo.findWithLock(orderId)
      if (!invoice) {
        throw new Error('INVOICE_NOT_FOUND')
      }

      // 3. Map status
      let newStatus: InvoiceStatus
      switch (transactionStatus) {
        case 'settlement':
        case 'capture':
          newStatus = InvoiceStatus.PAID
          break
        case 'pending':
          newStatus = InvoiceStatus.PENDING
          break
        case 'expire':
        case 'cancel':
          newStatus = InvoiceStatus.EXPIRED
          break
        case 'deny':
        case 'failure':
          newStatus = InvoiceStatus.FAILED
          break
        default:
          throw new Error('INVALID_TRANSACTION_STATUS')
      }

      // 4. Idempotency check
      if (invoice.status === newStatus) {
        console.info(`Idempotent callback for ${orderId}: status already ${newStatus}`)
        return invoice
      }

      // 5. Update
      invoice.status = newStatus
      invoice.gatewayResponse = JSON.stringify(rawResponse)

      if (newStatus === InvoiceStatus.PAID) {
        invoice.paidAt = new Date()
      }

      await txRepo.flush()

      console.info(`Invoice ${orderId} status updated: ${invoice.status}`)

      return invoice
    })
  }

  /**
   * ATOMIC STATUS UPDATE FROM PENDING
   */
  async updateStatusAtomicFromPending(
    orderId: string,
    newStatus: InvoiceStatus,
    paymentData?: any
  ): Promise<'SUCCESS' | 'NOOP'> {
    return await this.repository.updateStatusAtomicFromPending(orderId, newStatus, paymentData)
  }
}
