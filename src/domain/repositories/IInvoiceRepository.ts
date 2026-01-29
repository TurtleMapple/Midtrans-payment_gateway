import { Invoice } from '../entities/InvoiceEntity'
import { InvoiceStatus } from '../entities/InvoiceStatus'
import { FindOptions } from '@mikro-orm/core'

/**
 * INVOICE REPOSITORY INTERFACE
 *
 * Abstraksi untuk operasi database invoice yang mengikuti prinsip SOLID:
 * - Interface Segregation: Hanya method yang diperlukan
 * - Dependency Inversion: Service depend on abstraction, bukan concrete implementation
 *
 * Memungkinkan implementasi berbeda untuk MySQL, PostgreSQL, SQLite, atau bahkan NoSQL
 * tanpa mengubah business logic di service layer.
 */
export interface IInvoiceRepository {
  /**
   * Find all invoices with optional filtering
   */
  findAll(options?: { limit?: number; orderBy?: any }): Promise<Invoice[]>

  /**
   * Find invoice by ID
   */
  findById(id: string): Promise<Invoice | null>

  /**
   * Find invoice by Order ID
   */
  findByOrderId(orderId: string): Promise<Invoice | null>

  /**
   * Create new invoice
   */
  create(orderId: string, amount: number): Promise<Invoice>

  /**
   * Update invoice status with optional payment data
   */
  updateStatus(id: string, status: InvoiceStatus, paymentData?: any): Promise<Invoice>

  /**
   * Update invoice status by order ID
   */
  updateStatusByOrderId(orderId: string, status: InvoiceStatus, paymentData?: any): Promise<Invoice>

  /**
   * Atomic update from PENDING status (for race condition safety)
   */
  updateStatusAtomicFromPending(
    orderId: string,
    newStatus: InvoiceStatus,
    paymentData?: any
  ): Promise<'SUCCESS' | 'NOOP'>

  /**
   * Soft delete invoice
   */
  softDelete(id: string): Promise<Invoice>

  /**
   * Execute within a transaction
   */
  transaction<T>(callback: (repo: IInvoiceRepository) => Promise<T>): Promise<T>

  /**
   * Find with lock (for SELECT FOR UPDATE scenarios)
   */
  findWithLock(id: string): Promise<Invoice | null>

  /**
   * Persist and flush changes
   */
  persistAndFlush(invoice: Invoice): Promise<void>

  /**
   * Flush changes
   */
  flush(): Promise<void>
}
