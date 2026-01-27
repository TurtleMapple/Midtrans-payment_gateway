import 'dotenv/config';

export function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing env: ${key}`);
    return value;
  }  

export const env = {
  PORT: Number(requireEnv('PORT')),
  DB_HOST: requireEnv('DB_HOST'),
  DB_PORT: Number(requireEnv('DB_PORT')),
  DB_USER: requireEnv('DB_USER'),
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: requireEnv('DB_NAME'),
  API_KEY: requireEnv('API_KEY'),
  MIDTRANS_SERVER_KEY: requireEnv('MIDTRANS_SERVER_KEY'),
};
