.PHONY: help mariadb-up mariadb-down mariadb-config mariadb-logs mariadb-shell postgresql-up postgresql-down postgresql-config postgresql-logs postgresql-shell db-up db-down db-config db-logs clean

# Default database user (can be overridden with user=myuser)
user ?= payment_user
db ?= payment_gateway

help:
	@echo "Payment Gateway - Database Management"
	@echo ""
	@echo "Available targets:"
	@echo "  mariadb-up        - Start MariaDB container"
	@echo "  mariadb-down      - Stop and remove MariaDB container"
	@echo "  mariadb-config    - Show MariaDB configuration"
	@echo "  mariadb-logs      - View MariaDB logs (follow mode)"
	@echo "  mariadb-shell     - Access MariaDB shell (user=<username> db=<database>)"
	@echo "  postgresql-up     - Start PostgreSQL container"
	@echo "  postgresql-down   - Stop and remove PostgreSQL container"
	@echo "  postgresql-config - Show PostgreSQL configuration"
	@echo "  postgresql-logs   - View PostgreSQL logs (follow mode)"
	@echo "  postgresql-shell  - Access PostgreSQL shell (user=<username> db=<database>)"
	@echo "  db-up             - Start both MariaDB and PostgreSQL containers"
	@echo "  db-down           - Stop and remove both containers"
	@echo "  db-config         - Show configuration for both databases"
	@echo "  db-logs           - View logs for both databases"
	@echo "  clean             - Stop containers and remove volumes"
	@echo ""
	@echo "Examples:"
	@echo "  make mariadb-shell                    # Connect as payment_user to payment_gateway"
	@echo "  make mariadb-shell user=root          # Connect as root"
	@echo "  make postgresql-shell user=myuser db=mydb"

mariadb-up:
	docker-compose -f docker-compose.mariadb.yml up -d

mariadb-down:
	docker-compose -f docker-compose.mariadb.yml down -v

mariadb-config:
	docker-compose -f docker-compose.mariadb.yml config

mariadb-logs:
	docker-compose -f docker-compose.mariadb.yml logs -f

mariadb-shell:
	@echo "Connecting to MariaDB as user '$(user)' to database '$(db)'..."
	docker exec -it payment-gateway-mariadb mysql -u $(user) -p $(db)

postgresql-up:
	docker-compose -f docker-compose.postgresql.yml up -d

postgresql-down:
	docker-compose -f docker-compose.postgresql.yml down -v

postgresql-config:
	docker-compose -f docker-compose.postgresql.yml config

postgresql-logs:
	docker-compose -f docker-compose.postgresql.yml logs -f

postgresql-shell:
	@echo "Connecting to PostgreSQL as user '$(user)' to database '$(db)'..."
	docker exec -it payment-gateway-postgresql psql -U $(user) -d $(db)

db-up: mariadb-up postgresql-up

db-down: mariadb-down postgresql-down

db-config:
	@echo "=== MariaDB Configuration ==="
	@docker-compose -f docker-compose.mariadb.yml config
	@echo ""
	@echo "=== PostgreSQL Configuration ==="
	@docker-compose -f docker-compose.postgresql.yml config

db-logs:
	@echo "=== Viewing logs for both databases (Ctrl+C to exit) ==="
	@docker-compose -f docker-compose.mariadb.yml logs -f & docker-compose -f docker-compose.postgresql.yml logs -f

clean:
	docker-compose -f docker-compose.mariadb.yml down -v
	docker-compose -f docker-compose.postgresql.yml down -v
