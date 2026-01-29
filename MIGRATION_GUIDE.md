# Migration Guide: From Old Service to SOLID Architecture

## Quick Overview

Your application now supports **three database drivers** (MySQL, PostgreSQL, SQLite) with a clean SOLID architecture using the Repository Pattern.

## What Changed?

### 1. **Multi-Database Support**
- Configure database driver via `.env` file
- Supports: `mysql`, `postgresql`, `sqlite`
- Zero code changes needed to switch databases

### 2. **SOLID Architecture**
- Repository Pattern for data access
- Dependency Injection for testability
- Interface-based abstractions
- Separation of concerns

## File Structure

```
src/
├── repositories/              # NEW: Repository layer
│   ├── IInvoiceRepository.ts           # Interface (abstraction)
│   ├── MikroOrmInvoiceRepository.ts    # Concrete implementation
│   └── RepositoryFactory.ts            # Factory pattern
├── services/
│   ├── invoice.service.ts              # OLD: Original service (still works)
│   └── invoice.service.v2.ts           # NEW: SOLID version
└── examples/
    └── solid-usage.example.ts          # Usage examples
```

## Migration Options

### Option 1: Keep Using Old Service (No Migration Needed)

Your old service (`invoice.service.ts`) still works perfectly fine! The multi-database support is already integrated through `src/config/mikro-orm.ts`.

**No code changes required** - just set `DB_DRIVER` in your `.env` file.

```env
DB_DRIVER=mysql  # or postgresql, sqlite
```

### Option 2: Migrate to New Service (Recommended for New Code)

For new features or when refactoring, use the new SOLID architecture.

#### Before (Old Service)
```typescript
import { InvoiceService } from './services/invoice.service'

const service = new InvoiceService()
const invoice = await service.create('INV-001', 100000)
```

#### After (New Service)
```typescript
import { InvoiceService } from './services/invoice.service.v2'

const service = new InvoiceService()  // Same usage!
const invoice = await service.create('INV-001', 100000)
```

**That's it!** The API is identical, but the new version is more testable and maintainable.

## Step-by-Step Migration

### Step 1: Update Imports

**Find:**
```typescript
import { InvoiceService } from './services/invoice.service'
```

**Replace with:**
```typescript
import { InvoiceService } from './services/invoice.service.v2'
```

### Step 2: Update Routes (Example)

If you have routes using the old service:

**Before:**
```typescript
// routes/invoice.routes.ts
import { InvoiceService } from '../services/invoice.service'

app.get('/invoices/:id', async (c) => {
  const service = new InvoiceService()
  const invoice = await service.getById(c.req.param('id'))
  return c.json(invoice)
})
```

**After:**
```typescript
// routes/invoice.routes.ts
import { InvoiceService } from '../services/invoice.service.v2'

app.get('/invoices/:id', async (c) => {
  const service = new InvoiceService()
  const invoice = await service.getById(c.req.param('id'))
  return c.json(invoice)
})
```

### Step 3: (Optional) Use Dependency Injection

For better testability:

```typescript
import { InvoiceService } from '../services/invoice.service.v2'
import { createInvoiceRepository } from '../repositories/RepositoryFactory'

// Create repository once
const repository = createInvoiceRepository()

// Inject into service
const service = new InvoiceService(repository)
```

## Database Configuration

### MySQL (Default)
```env
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_NAME=payment_gateway
```

### PostgreSQL
```env
DB_DRIVER=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=secret
DB_NAME=payment_gateway
```

### SQLite
```env
DB_DRIVER=sqlite
DB_NAME=./database.sqlite
# DB_HOST, DB_PORT, DB_USER not needed for SQLite
```

## Testing Your Migration

### 1. Run Build
```bash
pnpm run build
```

### 2. Test Different Databases

#### Test with SQLite (Easiest)
```bash
# Update .env
DB_DRIVER=sqlite
DB_NAME=./test.sqlite

# Run migrations
pnpm run migration:up

# Start server
pnpm run dev
```

#### Test with PostgreSQL
```bash
# Start PostgreSQL (if using Docker)
docker run -d \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=payment_gateway \
  -p 5432:5432 \
  postgres:15

# Update .env
DB_DRIVER=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=secret
DB_NAME=payment_gateway

# Run migrations
pnpm run migration:up

# Start server
pnpm run dev
```

#### Test with MySQL (Current)
```bash
# Keep your current .env or set
DB_DRIVER=mysql

# Run server
pnpm run dev
```

## Benefits of Migration

### Before (Old Service)
- ✅ Works perfectly
- ❌ Direct database coupling
- ❌ Hard to test (requires real database)
- ❌ Business logic mixed with data access

### After (New Service)
- ✅ Works perfectly
- ✅ Clean separation of concerns
- ✅ Easy to test (mock repositories)
- ✅ Database-agnostic architecture
- ✅ Follows industry best practices
- ✅ Better for team collaboration

## Rollback Plan

If you encounter issues, simply revert imports:

```typescript
// Rollback to old service
import { InvoiceService } from './services/invoice.service'
```

Both services work with all three database drivers!

## API Compatibility

All methods are **100% compatible**:

| Method | Old Service | New Service | Notes |
|--------|-------------|-------------|-------|
| `getAll()` | ✅ | ✅ | Same |
| `create()` | ✅ | ✅ | Same |
| `getById()` | ✅ | ✅ | Same |
| `getByOrderId()` | ✅ | ✅ | Same |
| `updateStatus()` | ✅ | ✅ | Same |
| `updateStatusByOrderId()` | ✅ | ✅ | Same |
| `softDelete()` | ✅ | ✅ | Same |
| `generatePaymentLink()` | ✅ | ✅ | Same |
| `handleMidtransCallback()` | ✅ | ✅ | Same |
| `updateStatusAtomicFromPending()` | ✅ | ✅ | Same |

## Common Questions

### Q: Do I need to migrate immediately?
**A:** No! Both services work. Migrate when convenient.

### Q: Will my existing code break?
**A:** No! Old service still works with all database drivers.

### Q: Which database should I use?
**A:**
- **MySQL**: Production-ready, current setup
- **PostgreSQL**: Better for complex queries, JSON support
- **SQLite**: Perfect for development/testing, no server needed

### Q: How do I switch databases?
**A:** Just change `DB_DRIVER` in `.env` and run migrations.

### Q: Can I use both services together?
**A:** Yes! They work with the same database.

### Q: How do I test without affecting production?
**A:** Use SQLite for testing:
```env
DB_DRIVER=sqlite
DB_NAME=./test.sqlite
```

## Next Steps

1. ✅ **Multi-database support is already working**
2. ✅ **Old service works with all drivers**
3. 📖 Read `SOLID_ARCHITECTURE.md` for architecture details
4. 💡 See `src/examples/solid-usage.example.ts` for usage patterns
5. 🧪 Try different databases by changing `.env`
6. 🔄 Migrate to new service gradually (optional)

## Need Help?

- Check `SOLID_ARCHITECTURE.md` for architecture overview
- See `src/examples/solid-usage.example.ts` for code examples
- Old service remains fully functional as fallback

## Summary

✨ **Your application now supports MySQL, PostgreSQL, and SQLite!**

🎯 **Migration is optional** - both old and new services work perfectly.

🚀 **Recommended approach**: Use new service for new features, keep old service for existing code.

📚 **Everything is backward compatible** - no breaking changes!
