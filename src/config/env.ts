import 'dotenv/config';

export function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing env: ${key}`);
    return value;
  }

const DB_DRIVER = (process.env.DB_DRIVER || 'mysql').toLowerCase();
const SUPPORTED_DRIVERS = ['mysql', 'postgresql', 'sqlite'];

if (!SUPPORTED_DRIVERS.includes(DB_DRIVER)) {
  throw new Error(`Invalid DB_DRIVER: ${DB_DRIVER}. Supported drivers: ${SUPPORTED_DRIVERS.join(', ')}`);
}

export const env = {
  PORT: Number(requireEnv('PORT')),
  DB_DRIVER: DB_DRIVER as 'mysql' | 'postgresql' | 'sqlite',
  // For SQLite, these are optional
  DB_HOST: DB_DRIVER === 'sqlite' ? (process.env.DB_HOST || '') : requireEnv('DB_HOST'),
  DB_PORT: DB_DRIVER === 'sqlite' ? 0 : Number(requireEnv('DB_PORT')),
  DB_USER: DB_DRIVER === 'sqlite' ? (process.env.DB_USER || '') : requireEnv('DB_USER'),
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: requireEnv('DB_NAME'),
  API_KEY: requireEnv('API_KEY'),
  MIDTRANS_SERVER_KEY: requireEnv('MIDTRANS_SERVER_KEY'),
};
