import { EntityManager } from '@mikro-orm/core'
import { IInvoiceRepository } from './IInvoiceRepository'
import { MikroOrmInvoiceRepository } from './MikroOrmInvoiceRepository'
import { getEntityManager } from '../../config/db'

/**
 * REPOSITORY FACTORY
 *
 * Factory Pattern untuk membuat repository instances.
 * Mengikuti SOLID principles:
 * - Single Responsibility: Hanya bertanggung jawab membuat repositories
 * - Open/Closed: Mudah extend untuk repository types baru
 * - Dependency Inversion: Return interface, bukan concrete class
 *
 * Benefits:
 * - Centralized repository creation
 * - Easy testing (bisa inject mock repositories)
 * - Consistent EntityManager handling
 * - Future-proof untuk support database drivers lain
 */
export class RepositoryFactory {
  /**
   * Create Invoice Repository dengan EntityManager default
   */
  static createInvoiceRepository(): IInvoiceRepository {
    const em = getEntityManager()
    return new MikroOrmInvoiceRepository(em)
  }

  /**
   * Create Invoice Repository dengan custom EntityManager
   * Berguna untuk testing atau transaction-specific operations
   */
  static createInvoiceRepositoryWithEM(em: EntityManager): IInvoiceRepository {
    return new MikroOrmInvoiceRepository(em)
  }
}

/**
 * CONVENIENCE HELPER
 *
 * Shorthand untuk membuat repository tanpa Factory class
 * Useful untuk quick access di services
 */
export const createInvoiceRepository = (): IInvoiceRepository => {
  return RepositoryFactory.createInvoiceRepository()
}
