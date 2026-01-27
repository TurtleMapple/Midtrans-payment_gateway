import { Context, Next } from 'hono'
import { env } from '../config/env'

// Rate limiter storage - In-memory untuk simplicity
const rateLimiter = new Map<string, { count: number, resetTime: number }>()

/**
 * THROTTLE MIDDLEWARE
 * 
 * Rate limiting berdasarkan IP address untuk mencegah spam dan abuse.
 * Menggunakan sliding window algorithm.
 * 
 * @param maxRequests - Maksimal request dalam window
 * @param windowMs - Window time dalam milliseconds
 */
export const throttle = (maxRequests: number, windowMs: number) => {
  return async (c: Context, next: Next) => {
    const clientIP = c.req.header('x-forwarded-for') || 
                     c.req.header('x-real-ip') || 
                     'unknown'
    
    const now = Date.now()
    const client = rateLimiter.get(clientIP)
    
    // Reset window jika sudah expired
    if (!client || now > client.resetTime) {
      rateLimiter.set(clientIP, { count: 1, resetTime: now + windowMs })
      await next()
      return
    }
    
    // Check rate limit
    if (client.count >= maxRequests) {
      return c.json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil((client.resetTime - now) / 1000)
      }, 429)
    }
    
    // Increment counter
    client.count++
    await next()
  }
}

/**
 * PREDEFINED THROTTLE POLICIES
 */
export const throttlePolicies = {
  // Payment creation: 10 requests per minute
  paymentCreation: throttle(10, 60 * 1000),
  
  // Payment link generation: 3 requests per minute (expensive operation)
  paymentLink: throttle(3, 60 * 1000),
  
  // Callback endpoint: 100 requests per minute (high volume expected)
  callback: throttle(100, 60 * 1000),
  
  // General API: 30 requests per minute
  general: throttle(30, 60 * 1000)
}

/**
 * API KEY AUTHENTICATION MIDDLEWARE
 * 
 * Middleware untuk validasi API Key pada request header.
 * Mencegah spam dan akses tidak sah ke endpoint sensitif.
 * 
 * Header yang dibutuhkan:
 * - x-api-key: API key yang valid
 * 
 * Response Error:
 * - 401: API key tidak ada atau tidak valid
 */
export const apiKeyAuth = async (c: Context, next: Next) => {
    const apiKey = c.req.header('x-api-key')
    
    if (!apiKey || apiKey !== env.API_KEY) {
        return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    await next()
}

/**
 * COMBINED AUTH + THROTTLE MIDDLEWARE
 * 
 * Kombinasi authentication dan throttling untuk endpoint sensitif.
 */
export const authWithThrottle = (throttlePolicy: ReturnType<typeof throttle>) => {
  return async (c: Context, next: Next) => {
    // Apply throttling first
    await throttlePolicy(c, async () => {
      // Then apply auth
      await apiKeyAuth(c, next)
    })
  }
}

/**
 * CLEANUP EXPIRED ENTRIES
 * 
 * Membersihkan entries yang sudah expired untuk mencegah memory leak.
 * Jalankan secara periodik.
 */
export const cleanupRateLimiter = () => {
  const now = Date.now()
  for (const [ip, data] of rateLimiter.entries()) {
    if (now > data.resetTime) {
      rateLimiter.delete(ip)
    }
  }
}

// Auto cleanup setiap 5 menit
setInterval(cleanupRateLimiter, 5 * 60 * 1000)