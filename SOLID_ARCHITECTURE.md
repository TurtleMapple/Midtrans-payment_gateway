# SOLID Architecture Implementation

## Overview

This project has been refactored to follow SOLID principles with a clean Repository Pattern architecture that supports multiple database drivers (MySQL, PostgreSQL, SQLite).

## Architecture Layers

```
┌─────────────────────────────────────────┐
│         Routes / Controllers            │  ← HTTP Layer
├─────────────────────────────────────────┤
│            Services Layer               │  ← Business Logic
│   (InvoiceService, MidtransService)     │
├─────────────────────────────────────────┤
│         Repository Interface            │  ← Abstraction
│       (IInvoiceRepository)              │
├─────────────────────────────────────────┤
│    Concrete Repository Implementations  │  ← Data Access
│     (MikroOrmInvoiceRepository)         │
├─────────────────────────────────────────┤
│       Database Layer (MikroORM)         │  ← ORM
│   (MySQL / PostgreSQL / SQLite)         │
└─────────────────────────────────────────┘
```

## SOLID Principles Applied

### 1. **Single Responsibility Principle (SRP)**
- **Service Layer**: Only handles business logic and orchestration
- **Repository Layer**: Only handles data access and persistence
- **Entity**: Only represents data structure

### 2. **Open/Closed Principle (OCP)**
- System is **open for extension**: Can add new database drivers without modifying existing code
- System is **closed for modification**: Adding PostgreSQL/SQLite doesn't change business logic

### 3. **Liskov Substitution Principle (LSP)**
- Any implementation of `IInvoiceRepository` can replace another without breaking the system
- `MikroOrmInvoiceRepository` is fully substitutable with future implementations

### 4. **Interface Segregation Principle (ISP)**
- `IInvoiceRepository` contains only methods needed by services
- No fat interfaces with unused methods

### 5. **Dependency Inversion Principle (DIP)**
- Services depend on `IInvoiceRepository` (abstraction), NOT on concrete implementations
- High-level business logic doesn't depend on low-level database details

## File Structure

```
src/
├── repositories/
│   ├── IInvoiceRepository.ts           # Interface (abstraction)
│   ├── MikroOrmInvoiceRepository.ts    # Concrete implementation
│   └── RepositoryFactory.ts            # Factory pattern
├── services/
│   ├── invoice.service.ts              # Original service (legacy)
│   └── invoice.service.v2.ts           # SOLID refactored service
└── config/
    └── mikro-orm.ts                    # Multi-driver configuration
```

## Usage Examples

### Basic Usage (with default repository)

```typescript
import { InvoiceService } from './services/invoice.service.v2'

// Service automatically creates repository
const service = new InvoiceService()
const invoice = await service.create('INV-001', 100000)
```

### Dependency Injection (for testing or custom setup)

```typescript
import { InvoiceService } from './services/invoice.service.v2'
import { createInvoiceRepository } from './repositories/RepositoryFactory'

// Inject repository manually
const repository = createInvoiceRepository()
const service = new InvoiceService(repository)
```

### Testing with Mock Repository

```typescript
import { InvoiceService } from './services/invoice.service.v2'
import { IInvoiceRepository } from './repositories/IInvoiceRepository'

// Create mock repository
const mockRepository: IInvoiceRepository = {
  findById: jest.fn().mockResolvedValue(mockInvoice),
  create: jest.fn(),
  // ... other methods
}

// Inject mock for testing
const service = new InvoiceService(mockRepository)
```

## Database Driver Configuration

Set the driver in your `.env` file:

```env
# MySQL
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_NAME=payment_gateway

# PostgreSQL
DB_DRIVER=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=secret
DB_NAME=payment_gateway

# SQLite
DB_DRIVER=sqlite
DB_NAME=./database.sqlite
```

## Benefits

### 1. **Database Agnostic**
- Switch between MySQL, PostgreSQL, SQLite without changing business logic
- Easy to add new database systems (MongoDB, Redis, etc.)

### 2. **Testability**
- Mock repositories for unit testing
- Test business logic without database
- Integration tests with test database

### 3. **Maintainability**
- Clear separation of concerns
- Easy to understand and modify
- Changes in data layer don't affect business logic

### 4. **Scalability**
- Add new features without breaking existing code
- Support multiple databases simultaneously (if needed)
- Easy to optimize specific database operations

## Migration from Old Service

### Before (Tightly Coupled)
```typescript
import { getEntityManager } from '../config/mikro-orm'

class InvoiceService {
  async create(orderId: string, amount: number) {
    const em = getEntityManager()  // Direct dependency
    return await em.transactional(async (em) => {
      // Database code mixed with business logic
    })
  }
}
```

### After (SOLID + Dependency Injection)
```typescript
import { IInvoiceRepository } from '../repositories/IInvoiceRepository'

class InvoiceService {
  constructor(private readonly repository: IInvoiceRepository) {}

  async create(orderId: string, amount: number) {
    return await this.repository.create(orderId, amount)
  }
}
```

## Future Extensions

### Adding a New Database Driver

1. Keep the same interface: `IInvoiceRepository`
2. Create new implementation: e.g., `MongoInvoiceRepository`
3. Update factory to return new implementation
4. **No changes needed in services!**

### Example: MongoDB Support

```typescript
// repositories/MongoInvoiceRepository.ts
export class MongoInvoiceRepository implements IInvoiceRepository {
  constructor(private readonly client: MongoClient) {}

  async findById(id: string): Promise<Invoice | null> {
    return await this.client.db().collection('invoices').findOne({ _id: id })
  }
  // ... implement other methods
}

// Update RepositoryFactory
static createInvoiceRepository(): IInvoiceRepository {
  if (env.DB_DRIVER === 'mongodb') {
    return new MongoInvoiceRepository(getMongoClient())
  }
  return new MikroOrmInvoiceRepository(getEntityManager())
}
```

## Best Practices

1. **Always inject dependencies** instead of creating them inside classes
2. **Depend on interfaces**, not concrete implementations
3. **Keep business logic in services**, data access in repositories
4. **Use factory pattern** for complex object creation
5. **Write tests** for both services and repositories separately

## Conclusion

This architecture provides a solid foundation for:
- Multi-database support
- Easy testing
- Long-term maintainability
- Team collaboration
- Future extensibility

The system is now truly database-agnostic and follows enterprise-grade software design principles.
