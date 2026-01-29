import { EntityManager, LockMode } from '@mikro-orm/core'
import { Invoice } from '../entities/InvoiceEntity'
import { InvoiceStatus } from '../entities/InvoiceStatus'
import { IInvoiceRepository } from './IInvoiceRepository'

/**
 * MIKRO-ORM INVOICE REPOSITORY
 *
 * Concrete implementation menggunakan MikroORM.
 * Mendukung MySQL, PostgreSQL, dan SQLite melalui MikroORM driver abstraction.
 *
 * SOLID Principles:
 * - Single Responsibility: Hanya handle data access untuk Invoice
 * - Open/Closed: Bisa extend untuk custom queries tanpa modify base
 * - Liskov Substitution: Fully compatible dengan IInvoiceRepository
 * - Dependency Inversion: Depend on MikroORM abstraction
 */
export class MikroOrmInvoiceRepository implements IInvoiceRepository {
  constructor(private readonly em: EntityManager) {}

  async findAll(options?: { limit?: number; orderBy?: any }): Promise<Invoice[]> {
    const limit = options?.limit ?? 50
    const orderBy = options?.orderBy ?? { createdAt: 'DESC' }

    return await this.em.find(
      Invoice,
      { deletedAt: null },
      { limit, orderBy }
    )
  }

  async findById(id: string): Promise<Invoice | null> {
    return await this.em.findOne(Invoice, {
      id,
      deletedAt: null,
    })
  }

  async findByOrderId(orderId: string): Promise<Invoice | null> {
    return await this.em.findOne(Invoice, {
      orderId,
      deletedAt: null,
    })
  }

  async create(orderId: string, amount: number): Promise<Invoice> {
    return await this.em.transactional(async (em) => {
      // Check for duplicate
      const existing = await em.findOne(Invoice, { orderId, deletedAt: null })
      if (existing) {
        throw new Error('INVOICE_ALREADY_EXISTS')
      }

      // Create new invoice
      const invoice = new Invoice()
      invoice.orderId = orderId
      invoice.amount = amount

      await em.persistAndFlush(invoice)
      return invoice
    })
  }

  async updateStatus(id: string, status: InvoiceStatus, paymentData?: any): Promise<Invoice> {
    if (!Object.values(InvoiceStatus).includes(status)) {
      throw new Error('Invalid Status')
    }

    return await this.em.transactional(async (em) => {
      const invoice = await em.findOne(Invoice, { id, deletedAt: null })
      if (!invoice) throw new Error('Invoice not found')

      invoice.status = status
      if (paymentData) {
        invoice.paymentType = paymentData.paymentType
        invoice.bank = paymentData.bank
        invoice.vaNumber = paymentData.vaNumber
        invoice.gatewayResponse = paymentData.gatewayResponse
        if (status === InvoiceStatus.PAID) {
          invoice.paidAt = new Date()
        }
      }

      await em.flush()
      return invoice
    })
  }

  async updateStatusByOrderId(
    orderId: string,
    status: InvoiceStatus,
    paymentData?: any
  ): Promise<Invoice> {
    if (!Object.values(InvoiceStatus).includes(status)) {
      throw new Error('Invalid Status')
    }

    return await this.em.transactional(async (em) => {
      const invoice = await em.findOne(Invoice, { orderId, deletedAt: null })
      if (!invoice) {
        throw new Error(`Invoice with orderId ${orderId} not found`)
      }

      invoice.status = status

      if (paymentData) {
        invoice.paymentType = paymentData.paymentType
        invoice.bank = paymentData.bank
        invoice.vaNumber = paymentData.vaNumber
        invoice.gatewayResponse = paymentData.gatewayResponse

        if (status === InvoiceStatus.PAID) {
          invoice.paidAt = new Date()
        }
      }

      await em.flush()
      return invoice
    })
  }

  async updateStatusAtomicFromPending(
    orderId: string,
    newStatus: InvoiceStatus,
    paymentData?: any
  ): Promise<'SUCCESS' | 'NOOP'> {
    // Build update data
    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    }

    if (paymentData) {
      updateData.paymentType = paymentData.payment_type
      updateData.bank = paymentData.bank
      updateData.vaNumber = paymentData.va_number
      updateData.gatewayResponse = JSON.stringify(paymentData)

      if (newStatus === InvoiceStatus.PAID) {
        updateData.paidAt = new Date()
      }
    }

    // Atomic Compare-And-Set: Update only if status = PENDING
    const result = await this.em.nativeUpdate(
      Invoice,
      {
        orderId,
        status: InvoiceStatus.PENDING,
        deletedAt: null,
      },
      updateData
    )

    return result > 0 ? 'SUCCESS' : 'NOOP'
  }

  async softDelete(id: string): Promise<Invoice> {
    return await this.em.transactional(async (em) => {
      const invoice = await em.findOne(Invoice, { id, deletedAt: null })

      if (!invoice) {
        throw new Error('Invoice not found')
      }

      invoice.deletedAt = new Date()
      await em.flush()

      return invoice
    })
  }

  async transaction<T>(callback: (repo: IInvoiceRepository) => Promise<T>): Promise<T> {
    return await this.em.transactional(async (em) => {
      const txRepo = new MikroOrmInvoiceRepository(em)
      return await callback(txRepo)
    })
  }

  async findWithLock(id: string): Promise<Invoice | null> {
    return await this.em.findOne(
      Invoice,
      { id, deletedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    )
  }

  async persistAndFlush(invoice: Invoice): Promise<void> {
    await this.em.persistAndFlush(invoice)
  }

  async flush(): Promise<void> {
    await this.em.flush()
  }
}
