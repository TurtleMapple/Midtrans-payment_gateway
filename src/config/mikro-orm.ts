import { MikroORM } from '@mikro-orm/core'
import { MySqlDriver } from '@mikro-orm/mysql'
import { env } from './env'
import { Invoice } from '../database/entities/InvoiceEntity'

export const mikroOrmConfig = {
  driver: MySqlDriver,
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  dbName: env.DB_NAME,
  entities: [Invoice],
  migrations: { 
    path: './src/database/migrations',
    disableForeignKeys: false,
  },
  debug: process.env.NODE_ENV !== 'production',
}

export let orm: MikroORM<MySqlDriver>

export const initDatabase = async (): Promise<MikroORM<MySqlDriver>> => {
  try {
    orm = await MikroORM.init(mikroOrmConfig)
    console.log('✅ Database connected successfully')
    return orm
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : error}`)
  }
}

export const closeDatabase = async (): Promise<void> => {
  if (orm) {
    await orm.close()
    console.log('✅ Database connection closed')
  }
}

// Helper untuk mendapatkan EntityManager yang fresh
export const getEntityManager = () => {
  if (!orm) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return orm.em.fork()
}