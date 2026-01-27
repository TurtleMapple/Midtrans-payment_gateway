import { requireEnv } from './env';

export const midtransEnv = {
  MERCHANT_ID: requireEnv('MIDTRANS_MERCHANT_ID'),
  CLIENT_KEY: requireEnv('MIDTRANS_CLIENT_KEY'),
  SERVER_KEY: requireEnv('MIDTRANS_SERVER_KEY'),
  IS_PRODUCTION: process.env.MIDTRANS_IS_PRODUCTION === 'true',
};
