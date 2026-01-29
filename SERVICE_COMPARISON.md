# Service Comparison: invoice.service.ts vs invoice.service.v2.ts

## TL;DR - Quick Summary

| Aspect | invoice.service.ts (OLD) | invoice.service.v2.ts (NEW) |
|--------|--------------------------|------------------------------|
| **Architecture** | Direct database access | Repository Pattern |
| **Dependencies** | Tightly coupled to MikroORM | Loosely coupled via interface |
| **Testability** | Requires real database | Can use mock repositories |
| **SOLID Principles** | ❌ Violates DIP | ✅ Follows all SOLID principles |
| **Database Access** | `getEntityManager()` everywhere | Through `IInvoiceRepository` |
| **Flexibility** | Hard to extend | Easy to extend/modify |
| **Constructor** | No parameters | Dependency Injection |

---

## Detailed Comparison

### 1. **Imports & Dependencies**

#### OLD (`invoice.service.ts`)
```typescript
import { getEntityManager } from '../config/db'  // Direct coupling!
import { Invoice } from '../database/entities/InvoiceEntity'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import { LockMode } from '@mikro-orm/core'
```
❌ **Problem**: Directly imports and depends on MikroORM EntityManager

#### NEW (`invoice.service.v2.ts`)
```typescript
import { Invoice } from '../database/entities/InvoiceEntity'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import { IInvoiceRepository } from '../repositories/IInvoiceRepository'  // Abstraction!
import { createInvoiceRepository } from '../repositories/RepositoryFactory'
```
✅ **Benefit**: Depends on interface abstraction, not concrete implementation

---

### 2. **Class Structure**

#### OLD (`invoice.service.ts`)
```typescript
export class InvoiceService {
    // No constructor, no dependencies

    async getAll(limit: number = 50) {
        const em = getEntityManager()  // Creates dependency inside method
        return await em.find(Invoice, ...)
    }
}
```
❌ **Problems**:
- No dependency injection
- Creates `EntityManager` in every method
- Can't inject mock for testing
- Tightly coupled to database

#### NEW (`invoice.service.v2.ts`)
```typescript
export class InvoiceService {
  private readonly repository: IInvoiceRepository  // Dependency stored

  constructor(repository?: IInvoiceRepository) {   // Dependency Injection!
    this.repository = repository ?? createInvoiceRepository()
  }

  async getAll(limit: number = 50): Promise<Invoice[]> {
    return await this.repository.findAll({...})  // Uses repository
  }
}
```
✅ **Benefits**:
- Dependency injection via constructor
- Repository injected once, reused everywhere
- Can inject mock repository for testing
- Loosely coupled to abstraction

---

### 3. **Database Operations**

#### OLD (`invoice.service.ts`) - Example: `create()`
```typescript
async create(orderId: string, amount: number) {
    const em = getEntityManager()  // Direct database access

    return await em.transactional(async (em) => {
        // MikroORM-specific code
        const existing = await em.findOne(Invoice, { orderId, deletedAt: null })
        if (existing) {
            throw new Error('INVOICE_ALREADY_EXISTS')
        }

        const invoice = new Invoice()
        invoice.orderId = orderId
        invoice.amount = amount

        await em.persistAndFlush(invoice)
        return invoice
    })
}
```
❌ **Problems**:
- Business logic mixed with data access
- MikroORM details leak into service
- Hard to test without database
- Can't swap database implementation

#### NEW (`invoice.service.v2.ts`) - Example: `create()`
```typescript
async create(orderId: string, amount: number): Promise<Invoice> {
    return await this.repository.create(orderId, amount)  // Delegates to repository
}
```
✅ **Benefits**:
- Clean, simple, focused on business logic
- Data access hidden in repository
- Easy to test with mock repository
- Can swap repository implementation

---

### 4. **Complex Operations**

#### OLD (`invoice.service.ts`) - Example: `generatePaymentLink()`
```typescript
async generatePaymentLink(id: string): Promise<Invoice> {
    const em = getEntityManager()  // Direct DB access

    await em.transactional(async (em) => {
        invoice = await em.findOne(Invoice, { id, deletedAt: null })
        // ... validation logic ...
        await em.flush()
    })

    // ... Midtrans API call ...

    return await em.transactional(async (em) => {
        const updatedInvoice = await em.findOne(Invoice, { id, deletedAt: null })
        updatedInvoice.paymentLink = paymentLinkData.payment_url
        await em.flush()
        return updatedInvoice
    })
}
```
❌ **Problems**:
- 59 lines of mixed business logic and data access
- Multiple `getEntityManager()` calls
- Database code scattered throughout

#### NEW (`invoice.service.v2.ts`) - Example: `generatePaymentLink()`
```typescript
async generatePaymentLink(id: string): Promise<Invoice> {
    // Step 1: Validate via repository
    await this.repository.transaction(async (txRepo) => {
        invoice = await txRepo.findById(id)
        // ... validation logic ...
        await txRepo.flush()
    })

    // Step 2: Call Midtrans API (business logic)
    // ... Midtrans API call ...

    // Step 3: Update via repository
    return await this.repository.transaction(async (txRepo) => {
        const updatedInvoice = await txRepo.findById(id)
        updatedInvoice.paymentLink = paymentLinkData.payment_url
        await txRepo.flush()
        return updatedInvoice
    })
}
```
✅ **Benefits**:
- Clear separation: repository for data, service for business logic
- Easier to read and understand
- Can test business logic independently

---

### 5. **Testing Comparison**

#### OLD (`invoice.service.ts`)
```typescript
// Testing requires REAL DATABASE
describe('InvoiceService', () => {
  it('should create invoice', async () => {
    // Must connect to real database
    await initDatabase()

    const service = new InvoiceService()
    const invoice = await service.create('INV-001', 100000)

    expect(invoice.orderId).toBe('INV-001')
  })
})
```
❌ **Problems**:
- Slow tests (database I/O)
- Need database setup/teardown
- Integration tests only, no unit tests
- Can't test business logic independently

#### NEW (`invoice.service.v2.ts`)
```typescript
// Testing with MOCK REPOSITORY (no database!)
describe('InvoiceService', () => {
  it('should create invoice', async () => {
    // Create mock repository
    const mockRepo: IInvoiceRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'test-id',
        orderId: 'INV-001',
        amount: 100000,
        status: InvoiceStatus.PENDING,
      }),
      // ... other methods mocked
    }

    // Inject mock
    const service = new InvoiceService(mockRepo)
    const invoice = await service.create('INV-001', 100000)

    expect(invoice.orderId).toBe('INV-001')
    expect(mockRepo.create).toHaveBeenCalledWith('INV-001', 100000)
  })
})
```
✅ **Benefits**:
- Fast tests (no database)
- No setup/teardown needed
- True unit tests possible
- Test business logic independently
- Can test edge cases easily

---

### 6. **SOLID Principles Violation vs Compliance**

#### OLD (`invoice.service.ts`)

| Principle | Compliance | Reason |
|-----------|------------|--------|
| **S**ingle Responsibility | ❌ | Service handles both business logic AND data access |
| **O**pen/Closed | ❌ | Can't extend without modifying (tightly coupled to MikroORM) |
| **L**iskov Substitution | ❌ | No interfaces, can't substitute implementations |
| **I**nterface Segregation | ❌ | No interfaces at all |
| **D**ependency Inversion | ❌ | Depends on concrete `EntityManager`, not abstraction |

#### NEW (`invoice.service.v2.ts`)

| Principle | Compliance | Reason |
|-----------|------------|--------|
| **S**ingle Responsibility | ✅ | Service = business logic only, Repository = data access |
| **O**pen/Closed | ✅ | Can add new repository types without modifying service |
| **L**iskov Substitution | ✅ | Any `IInvoiceRepository` implementation works |
| **I**nterface Segregation | ✅ | Clean, focused `IInvoiceRepository` interface |
| **D**ependency Inversion | ✅ | Depends on `IInvoiceRepository` abstraction |

---

### 7. **Practical Impact**

#### Scenario 1: "I want to add Redis caching"

**OLD Service:**
```typescript
// Must modify every method in service
async getById(id: string) {
    const em = getEntityManager()
    const cached = await redis.get(id)  // Add caching logic here
    if (cached) return cached

    const invoice = await em.findOne(...)  // Modify existing code
    await redis.set(id, invoice)
    return invoice
}
```
❌ Modify service for infrastructure concern

**NEW Service:**
```typescript
// Create CachedInvoiceRepository (no service changes!)
class CachedInvoiceRepository implements IInvoiceRepository {
  constructor(
    private baseRepo: IInvoiceRepository,
    private redis: RedisClient
  ) {}

  async findById(id: string) {
    const cached = await this.redis.get(id)
    if (cached) return cached

    const invoice = await this.baseRepo.findById(id)
    await this.redis.set(id, invoice)
    return invoice
  }
}

// Use it
const baseRepo = createInvoiceRepository()
const cachedRepo = new CachedInvoiceRepository(baseRepo, redis)
const service = new InvoiceService(cachedRepo)  // That's it!
```
✅ Add caching without touching service (Decorator Pattern)

---

#### Scenario 2: "I want to switch to MongoDB"

**OLD Service:**
```typescript
// Must rewrite ENTIRE service
async getAll(limit: number = 50) {
    const em = getEntityManager()  // This is MikroORM-specific
    return await em.find(...)       // Must change to MongoDB client
}

async create(orderId: string, amount: number) {
    const em = getEntityManager()  // This is MikroORM-specific
    // Rewrite everything...
}
// ... rewrite all 10+ methods
```
❌ Massive refactoring, high risk

**NEW Service:**
```typescript
// Create MongoInvoiceRepository
class MongoInvoiceRepository implements IInvoiceRepository {
  async findAll(options) {
    return await mongoClient.collection('invoices').find(...).toArray()
  }

  async create(orderId, amount) {
    return await mongoClient.collection('invoices').insertOne(...)
  }
  // ... implement interface
}

// Use it
const mongoRepo = new MongoInvoiceRepository(mongoClient)
const service = new InvoiceService(mongoRepo)  // Service unchanged!
```
✅ Zero service changes, just swap repository

---

### 8. **When to Use Which?**

#### Use OLD Service (`invoice.service.ts`) when:
- ✅ You need a quick fix
- ✅ Project is small and won't grow
- ✅ No plans to add tests
- ✅ Database won't change
- ✅ Team is not familiar with SOLID

#### Use NEW Service (`invoice.service.v2.ts`) when:
- ✅ Building production applications
- ✅ Need comprehensive testing
- ✅ Multiple database support needed
- ✅ Team follows best practices
- ✅ Long-term maintainability matters
- ✅ Want to add caching/logging/etc.

---

## Visual Architecture Comparison

### OLD Architecture (Tightly Coupled)
```
┌─────────────────────────┐
│   InvoiceService        │
│  ┌──────────────────┐   │
│  │ Business Logic   │   │
│  │       +          │   │
│  │  Data Access     │   │  ← Everything mixed together
│  │       +          │   │
│  │  MikroORM Code   │   │
│  └──────────────────┘   │
└────────────┬────────────┘
             │ Direct coupling
             ↓
      ┌──────────────┐
      │  MikroORM    │
      │   (MySQL)    │
      └──────────────┘
```
❌ Cannot swap database, hard to test

### NEW Architecture (Loosely Coupled)
```
┌─────────────────────────┐
│   InvoiceService        │  ← Pure business logic
│  (Business Logic Only)  │
└────────────┬────────────┘
             │ Depends on interface
             ↓
      ┌──────────────────┐
      │ IInvoiceRepository│  ← Abstraction layer
      └──────────────────┘
             △
             │ Implements
      ┌──────────────────┐
      │ MikroOrmInvoice  │  ← Can swap with any implementation
      │   Repository     │
      └────────┬─────────┘
               ↓
         ┌──────────┐
         │ MikroORM │
         │  (MySQL) │
         └──────────┘
```
✅ Can swap database, easy to test, follows SOLID

---

## Migration Effort

**Migrating from OLD to NEW is EASY!**

Just change the import:
```typescript
// Before
import { InvoiceService } from './services/invoice.service'

// After
import { InvoiceService } from './services/invoice.service.v2'

// Usage is IDENTICAL
const service = new InvoiceService()
const invoice = await service.create('INV-001', 100000)
```

**That's literally it!** The API is 100% compatible.

---

## Conclusion

| Criterion | OLD | NEW |
|-----------|-----|-----|
| **Simplicity** | ✅ Simple for small apps | ✅ Simple API, complex inside |
| **SOLID Principles** | ❌ Violates most | ✅ Follows all |
| **Testability** | ❌ Poor | ✅ Excellent |
| **Maintainability** | ❌ Declines over time | ✅ Stays clean |
| **Flexibility** | ❌ Rigid | ✅ Very flexible |
| **Database Agnostic** | ❌ Coupled to MikroORM | ✅ True abstraction |
| **Production Ready** | ⚠️ For simple cases | ✅ For all cases |

**Recommendation**: Use **NEW service** for all new code and production applications. Keep OLD service only for legacy compatibility if needed.
