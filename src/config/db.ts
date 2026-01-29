import { MikroORM, EntityCaseNamingStrategy, Options } from "@mikro-orm/core";
import { MySqlDriver } from "@mikro-orm/mysql";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { Migrator } from "@mikro-orm/migrations";
import { env } from "./env";
import { Invoice } from "../database/entities/InvoiceEntity";

// Get driver class based on env configuration
const getDriver = () => {
  switch (env.DB_DRIVER) {
    case "mysql":
      return MySqlDriver;
    case "postgresql":
      return PostgreSqlDriver;
    case "sqlite":
      return SqliteDriver;
    default:
      throw new Error(`Unsupported database driver: ${env.DB_DRIVER}`);
  }
};

// Build database configuration based on driver type
const getDatabaseConfig = () => {
  const baseConfig = {
    entities: [Invoice],
    extensions: [Migrator],
    migrations: {
      path: "./src/database/migrations",
      disableForeignKeys: false,
    },
    namingStrategy: EntityCaseNamingStrategy,
    debug: process.env.NODE_ENV !== "production",
  };

  if (env.DB_DRIVER === "sqlite") {
    return {
      ...baseConfig,
      driver: SqliteDriver,
      dbName: env.DB_NAME,
    };
  }

  // MySQL and PostgreSQL configuration
  return {
    ...baseConfig,
    driver: getDriver(),
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    dbName: env.DB_NAME,
  };
};

export const dbConfig = getDatabaseConfig() as Options;

export let orm: MikroORM;

export const initDatabase = async (): Promise<MikroORM> => {
  try {
    orm = await MikroORM.init(dbConfig);
    console.log(
      `✅ Database connected successfully using ${env.DB_DRIVER} driver`,
    );
    return orm;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw new Error(
      `Failed to initialize database: ${error instanceof Error ? error.message : error}`,
    );
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (orm) {
    await orm.close();
    console.log("✅ Database connection closed");
  }
};

export const getEntityManager = () => {
  if (!orm) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return orm.em.fork();
};
