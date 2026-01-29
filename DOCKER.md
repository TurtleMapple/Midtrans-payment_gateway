# Docker Database Setup

This project supports both MariaDB and PostgreSQL databases via Docker Compose.

## Quick Start

### Using Makefile (Recommended)

The project includes a Makefile for easier database management. Run `make help` to see all available commands.

#### Using MariaDB

1. Start the MariaDB container:
```bash
make mariadb-up
```

2. Verify configuration (optional):
```bash
make mariadb-config
```

3. Copy the MariaDB environment configuration:
```bash
cp .env.mariadb .env
```

4. Run migrations:
```bash
pnpm migration:up
```

5. Start the application:
```bash
pnpm dev
```

#### Using PostgreSQL

1. Start the PostgreSQL container:
```bash
make postgresql-up
```

2. Verify configuration (optional):
```bash
make postgresql-config
```

3. Copy the PostgreSQL environment configuration:
```bash
cp .env.postgresql .env
```

4. Run migrations:
```bash
pnpm migration:up
```

5. Start the application:
```bash
pnpm dev
```

#### Using Both Databases

Start both databases at once:
```bash
make db-up
```

Stop both databases:
```bash
make db-down
```

### Using Docker Compose Directly

#### Using MariaDB

1. Start the MariaDB container:
```bash
docker-compose -f docker-compose.mariadb.yml up -d
```

2. Copy the MariaDB environment configuration:
```bash
cp .env.mariadb .env
```

3. Run migrations:
```bash
pnpm migration:up
```

4. Start the application:
```bash
pnpm dev
```

#### Using PostgreSQL

1. Start the PostgreSQL container:
```bash
docker-compose -f docker-compose.postgresql.yml up -d
```

2. Copy the PostgreSQL environment configuration:
```bash
cp .env.postgresql .env
```

3. Run migrations:
```bash
pnpm migration:up
```

4. Start the application:
```bash
pnpm dev
```

## Database Management

### Available Makefile Commands

Run `make help` to see all available commands:

- `make mariadb-up` - Start MariaDB container
- `make mariadb-down` - Stop MariaDB container
- `make mariadb-config` - Show MariaDB configuration
- `make postgresql-up` - Start PostgreSQL container
- `make postgresql-down` - Stop PostgreSQL container
- `make postgresql-config` - Show PostgreSQL configuration
- `make db-up` - Start both databases
- `make db-down` - Stop both databases
- `make db-config` - Show configuration for both databases
- `make clean` - Stop containers and remove volumes (deletes all data)

### Stop the database

**Using Makefile:**
```bash
make mariadb-down    # Stop MariaDB
make postgresql-down # Stop PostgreSQL
make db-down         # Stop both
```

**Using Docker Compose:**
```bash
docker-compose -f docker-compose.mariadb.yml down
docker-compose -f docker-compose.postgresql.yml down
```

### Remove database data (reset)

**Using Makefile:**
```bash
make clean  # Removes all containers and volumes
```

**Using Docker Compose:**
```bash
docker-compose -f docker-compose.mariadb.yml down -v
docker-compose -f docker-compose.postgresql.yml down -v
```

### View logs

**MariaDB:**
```bash
docker-compose -f docker-compose.mariadb.yml logs -f
```

**PostgreSQL:**
```bash
docker-compose -f docker-compose.postgresql.yml logs -f
```

### Access database shell

**MariaDB:**
```bash
docker exec -it payment-gateway-mariadb mysql -u payment_user -ppayment_password payment_gateway
```

**PostgreSQL:**
```bash
docker exec -it payment-gateway-postgresql psql -U payment_user -d payment_gateway
```

## Database Credentials

Both configurations use the following credentials (you can modify them in the respective docker-compose files):

- **Database Name:** `payment_gateway`
- **Username:** `payment_user`
- **Password:** `payment_password`

**MariaDB root password:** `root_password`

## Switching Between Databases

1. Stop the current database container
2. Start the new database container
3. Copy the appropriate `.env` file
4. Run migrations
5. Restart your application
