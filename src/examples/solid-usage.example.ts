/**
 * SOLID ARCHITECTURE USAGE EXAMPLES
 *
 * This file demonstrates how to use the new SOLID-based architecture
 * with Repository Pattern and Dependency Injection.
 */

import { InvoiceService } from '../domain/services/invoice.service'
import { createInvoiceRepository, RepositoryFactory } from '../domain/repositories/RepositoryFactory'
import { IInvoiceRepository } from '../domain/repositories/IInvoiceRepository'
import { InvoiceStatus } from '../domain/entities/InvoiceStatus'

// ========================================
// EXAMPLE 1: Basic Usage (Default Setup)
// ========================================
async function example1_BasicUsage() {
  // Service automatically creates the repository
  const invoiceService = new InvoiceService()

  // Create invoice
  const invoice = await invoiceService.create('INV-2024-001', 250000)
  console.log('Invoice created:', invoice.id)

  // Get invoice
  const found = await invoiceService.getById(invoice.id)
  console.log('Found invoice:', found?.orderId)

  // Get all invoices
  const invoices = await invoiceService.getAll(10)
  console.log(`Found ${invoices.length} invoices`)
}

// ========================================
// EXAMPLE 2: With Explicit Repository
// ========================================
async function example2_ExplicitRepository() {
  // Create repository explicitly
  const repository = createInvoiceRepository()

  // Inject into service
  const invoiceService = new InvoiceService(repository)

  // Use service as normal
  const invoice = await invoiceService.create('INV-2024-002', 150000)
  console.log('Invoice created with explicit repository')
}

// ========================================
// EXAMPLE 3: Using Repository Factory
// ========================================
async function example3_RepositoryFactory() {
  // Use factory for more control
  const repository = RepositoryFactory.createInvoiceRepository()
  const service = new InvoiceService(repository)

  const invoice = await service.create('INV-2024-003', 300000)
  console.log('Invoice created via factory')
}

// ========================================
// EXAMPLE 4: Testing with Mock Repository
// ========================================
async function example4_MockRepository() {
  // Create a mock repository for testing
  const mockRepository: IInvoiceRepository = {
    findAll: async () => [],
    findById: async (id) => {
      return {
        id,
        orderId: 'MOCK-001',
        amount: 100000,
        status: InvoiceStatus.PENDING,
        gateway: 'midtrans',
        createdAt: new Date(),
        updatedAt: new Date(),
        paymentAttemptCount: 0,
      } as any
    },
    findByOrderId: async () => null,
    create: async (orderId, amount) => {
      return {
        id: 'test-id',
        orderId,
        amount,
        status: InvoiceStatus.PENDING,
        gateway: 'midtrans',
        createdAt: new Date(),
        updatedAt: new Date(),
        paymentAttemptCount: 0,
      } as any
    },
    updateStatus: async () => ({} as any),
    updateStatusByOrderId: async () => ({} as any),
    updateStatusAtomicFromPending: async () => 'SUCCESS' as const,
    softDelete: async () => ({} as any),
    transaction: async (callback) => callback(mockRepository),
    findWithLock: async () => null,
    persistAndFlush: async () => {},
    flush: async () => {},
  }

  // Use mock in service
  const service = new InvoiceService(mockRepository)
  const invoice = await service.getById('test-123')
  console.log('Mock repository returned:', invoice?.orderId)
}

// ========================================
// EXAMPLE 5: Direct Repository Usage
// ========================================
async function example5_DirectRepositoryUsage() {
  const repository = createInvoiceRepository()

  // Use repository directly (without service layer)
  const invoice = await repository.create('INV-2024-004', 500000)
  console.log('Created directly via repository:', invoice.id)

  // Update status
  await repository.updateStatus(invoice.id, InvoiceStatus.PAID, {
    paymentType: 'bank_transfer',
    bank: 'BCA',
  })

  console.log('Invoice marked as paid')
}

// ========================================
// EXAMPLE 6: Transaction Handling
// ========================================
async function example6_TransactionHandling() {
  const repository = createInvoiceRepository()

  // Use repository transaction
  const result = await repository.transaction(async (txRepo) => {
    // Create invoice in transaction
    const invoice = await txRepo.create('INV-2024-005', 400000)

    // Update status in same transaction
    await txRepo.updateStatus(invoice.id, InvoiceStatus.PENDING)

    return invoice
  })

  console.log('Transaction completed:', result.orderId)
}

// ========================================
// EXAMPLE 7: Atomic Updates
// ========================================
async function example7_AtomicUpdate() {
  const service = new InvoiceService()

  // Create invoice
  const invoice = await service.create('INV-2024-006', 200000)

  // Atomic update from PENDING to PAID
  const result = await service.updateStatusAtomicFromPending(invoice.orderId, InvoiceStatus.PAID, {
    payment_type: 'credit_card',
    bank: 'BNI',
  })

  console.log('Atomic update result:', result)
}

// ========================================
// EXAMPLE 8: Real-World Workflow
// ========================================
async function example8_RealWorldWorkflow() {
  const service = new InvoiceService()

  try {
    // 1. Create invoice
    const invoice = await service.create('INV-2024-007', 1000000)
    console.log('Step 1: Invoice created')

    // 2. Generate payment link
    const withPaymentLink = await service.generatePaymentLink(invoice.id)
    console.log('Step 2: Payment link generated:', withPaymentLink.paymentLink)

    // 3. Simulate callback from Midtrans
    const updated = await service.updateStatusAtomicFromPending(
      invoice.orderId,
      InvoiceStatus.PAID,
      {
        payment_type: 'bank_transfer',
        bank: 'BCA',
        va_number: '1234567890',
      }
    )
    console.log('Step 3: Payment confirmed:', updated)

    // 4. Get final status
    const final = await service.getById(invoice.id)
    console.log('Step 4: Final status:', final?.status)
  } catch (error) {
    console.error('Workflow error:', error)
  }
}

// ========================================
// Export examples for use
// ========================================
export const examples = {
  example1_BasicUsage,
  example2_ExplicitRepository,
  example3_RepositoryFactory,
  example4_MockRepository,
  example5_DirectRepositoryUsage,
  example6_TransactionHandling,
  example7_AtomicUpdate,
  example8_RealWorldWorkflow,
}

// Run all examples (commented out by default)
/*
async function runAllExamples() {
  console.log('Running SOLID Architecture Examples...\n')

  await example1_BasicUsage()
  await example2_ExplicitRepository()
  await example3_RepositoryFactory()
  await example4_MockRepository()
  await example5_DirectRepositoryUsage()
  await example6_TransactionHandling()
  await example7_AtomicUpdate()
  await example8_RealWorldWorkflow()

  console.log('\nAll examples completed!')
}

runAllExamples().catch(console.error)
*/
