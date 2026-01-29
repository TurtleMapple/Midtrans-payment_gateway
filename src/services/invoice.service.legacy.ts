import { getEntityManager } from '../config/db'
import { Invoice } from '../database/entities/InvoiceEntity'
import { InvoiceStatus } from '../database/entities/InvoiceStatus'
import { midtransEnv } from '../config/midtrans'
import { LockMode } from '@mikro-orm/core'

interface MidtransPaymentLinkResponse {
    payment_url: string
    order_id: string
    payment_id: string
}

/**
 * INVOICE SERVICE
 * 
 * Service untuk mengelola operasi invoice di database.
 * Menggunakan MikroORM untuk interaksi dengan MySQL.
 * 
 * Fitur utama:
 * - Buat invoice baru dengan validasi duplicate
 * - Ambil invoice by ID atau OrderID
 * - Update status invoice dengan data payment
 */
export class InvoiceService {

    /**
     * AMBIL SEMUA INVOICES
     * 
     * Mengambil daftar invoice dengan limit sederhana.
     * Hanya untuk keperluan basic listing.
     * 
     * @param limit - Maksimal jumlah invoice (default: 50)
     * @returns Array of invoices
     */
    async getAll(limit: number = 50) {
        const em = getEntityManager()
        return await em.find(Invoice, 
            { deletedAt: null }, 
            { limit, orderBy: { createdAt: 'DESC' } }
        )
    }



    /**
     * BUAT INVOICE BARU
     * 
     * Membuat invoice baru dengan validasi duplicate orderId.
     * Status default akan di-set ke 'pending' oleh entity.
     * 
     * orderId - Kode unik invoice (biasanya auto-generated)
     * amount - Jumlah tagihan dalam rupiah
     * returns Invoice yang baru dibuat dengan ID dari database
     * throws 'INVOICE_ALREADY_EXISTS' jika orderId sudah ada
     * throws 'Database not initialized' jika ORM belum ready
     */
    async create(orderId: string, amount: number) {
        const em = getEntityManager() // MikroORM: Ambil EntityManager untuk database operations
        
        // MikroORM Transaction: Wrap operasi dalam transaction untuk data consistency
        return await em.transactional(async (em) => {
            // MikroORM: Query untuk cek duplicate orderId dengan soft delete filter
            const existing = await em.findOne(Invoice, { orderId, deletedAt: null })
            if (existing) {
                throw new Error('INVOICE_ALREADY_EXISTS')
            }
            
            // MikroORM: Buat entity baru dan set properties
            const invoice = new Invoice()
            invoice.orderId = orderId
            invoice.amount = amount
            
            // MikroORM: Persist entity ke database (akan di-commit saat transaction selesai)
            await em.persistAndFlush(invoice)
            return invoice
        })
    }


    
    /**
     * GENERATE PAYMENT LINK
     * 
     * Membuat payment link Midtrans untuk invoice yang sudah ada.
     * Menggunakan pattern: Lock → Mark Processing → External API → Update Result
     * 
     * @param id - ID invoice yang akan dibuatkan payment link
     * @returns Invoice yang sudah diupdate dengan payment link
     * @throws 'Invoice Not Found' jika ID tidak ditemukan
     * @throws 'Midtrans API error' jika gagal call API Midtrans
     * 
     * Flow:
     * 1. Lock & validate invoice (SELECT FOR UPDATE)
     * 2. Mark "payment_link_generating"
     * 3. Commit transaction
     * 4. Call Midtrans API (outside transaction)
     * 5. Update invoice dengan payment link
     */
    async generatePaymentLink(id: string): Promise<Invoice> {
        const em = getEntityManager()
        
        // Step 1-3: Lock, validate, mark processing, commit
        let invoice: Invoice | null = null


        await em.transactional(async (em) => {
            // MikroORM: SELECT FOR UPDATE untuk lock invoice
            invoice = await em.findOne(Invoice, { id, deletedAt: null })
            if (!invoice) {
                throw new Error('Invoice Not Found')
            }

            if (invoice.status === InvoiceStatus.PAID) {
                throw new Error('INVOICE_ALREADY_PAID');
            }

            if (invoice.status === InvoiceStatus.EXPIRED) {
                throw new Error('INVOICE_EXPIRED');
            }

            if (invoice.paymentAttemptCount >= 3){
                throw new Error ('MAX_PAYMENT_ATTEMPTS_REACHED')
            }

            if (invoice.paymentLink && invoice.paymentLinkCreatedAt) {
                const linkAge = Date.now() - invoice.paymentLinkCreatedAt.getTime()
                const maxAge = 30 * 60 * 1000
                
                if (linkAge < maxAge) {
                    throw new Error ('ACTIVE_PAYMENT_LINK_EXISTS')
                }
            }
            
            // ✅ FIX #3: Mark as in-progress dengan timestamp
            invoice.paymentAttemptCount = (invoice.paymentAttemptCount || 0) + 1
            invoice.paymentLinkCreatedAt = new Date() // State marker
            await em.flush()
        })
        
        try {
            // ✅ FIX #1: Deterministic order_id
            const midtransOrderId = `${invoice!.orderId.substring(0, 25)}-${invoice!.paymentAttemptCount}`
            
            const payload = {
                transaction_details: {
                    order_id: midtransOrderId, // Traceable & deterministic
                    gross_amount: invoice!.amount
                },
                usage_limit: 1,
                expiry: {
                    duration: 30,
                    unit: "minutes"
                },
                finish_redirect_url: `https://mansur.my.id/payment/success?order_id=${invoice!.orderId}`
            }

            const midtransUrl = midtransEnv.IS_PRODUCTION
                ? 'https://api.midtrans.com/v1/payment-links'
                : 'https://api.sandbox.midtrans.com/v1/payment-links'

            const response = await fetch(midtransUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(midtransEnv.SERVER_KEY + ':').toString('base64')}`
                },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const errorData = await response.text()
                throw new Error(`Midtrans API error: ${response.status} - ${errorData}`)
            }

            const paymentLinkData = await response.json() as MidtransPaymentLinkResponse
            
            // Step 5: Update dengan hasil API (dalam transaction terpisah)
            return await em.transactional(async (em) => {
                // Re-fetch invoice untuk memastikan data terbaru
                const updatedInvoice = await em.findOne(Invoice, { id, deletedAt: null })
                if (!updatedInvoice) {
                    throw new Error('Invoice Not Found')
                }
                
                updatedInvoice.paymentLink = paymentLinkData.payment_url
                // Keep paymentLinkCreatedAt as success timestamp
                await em.flush()
                
                console.info(`Payment link generated for invoice ${updatedInvoice.orderId}: ${paymentLinkData.payment_url}`)
                
                return updatedInvoice
            })

        } catch (error) {
            // ✅ FIX #2: NO rollback attempt count
            // ✅ FIX #3: Clear timestamp to mark as failed
            await em.transactional(async (em) => {
                const failedInvoice = await em.findOne(Invoice, { id, deletedAt: null })
                if (failedInvoice) {
                    failedInvoice.paymentLinkCreatedAt = null as any // Mark as failed
                    // paymentAttemptCount tetap naik (tidak di-rollback)
                    await em.flush()
                }
            })
            
            console.error('Failed to generate payment link:', error)
            throw error
        }
    }

    /**
     * SOFT DELETE INVOICE
     * 
     * Menandai invoice sebagai dihapus tanpa menghapus dari database.
     * Menggunakan deletedAt timestamp untuk audit trail.
     * 
     * @param id - ID invoice yang akan dihapus
     * @returns Invoice yang sudah ditandai sebagai dihapus
     * @throws 'Invoice not found' jika ID tidak ditemukan
     */
    async softDelete(id: string) {
        const em = getEntityManager() // MikroORM: Ambil EntityManager untuk database operations
        
        // MikroORM Transaction: Wrap operasi dalam transaction untuk data consistency
        return await em.transactional(async (em) => {
            // MikroORM: Query untuk cari invoice berdasarkan ID dengan soft delete filter
            const invoice = await em.findOne(Invoice, { id, deletedAt: null })
            
            if (!invoice) {
                throw new Error('Invoice not found')
            }
            
            // MikroORM: Update entity dengan soft delete timestamp
            invoice.deletedAt = new Date()
            // MikroORM: Flush perubahan ke database (akan di-commit saat transaction selesai)
            await em.flush()
            
            return invoice
        })
    }

    /**
     * AMBIL INVOICE BY ID
     * 
     * Mencari invoice berdasarkan primary key (ID).
     * Hanya mengambil invoice yang belum dihapus (deletedAt: null).
     * 
     * @param id - ID invoice di database
     * @returns Invoice jika ditemukan, null jika tidak ada
     */
    async getById(id: string) {
        const em = getEntityManager()
        return await em.findOne(Invoice, { 
            id, 
            deletedAt: null
        })
    }

    /**
     * AMBIL INVOICE BY ORDER ID
     * 
     * Mencari invoice berdasarkan orderId (kode unik).
     * Berguna untuk webhook atau pencarian external.
     * Hanya mengambil invoice yang belum dihapus.
     * 
     * @param orderId - Kode unik invoice
     * @returns Invoice jika ditemukan, null jika tidak ada
     */
    async getByOrderId(orderId: string) {
        const em = getEntityManager()
        return await em.findOne(Invoice, { 
            orderId, 
            deletedAt: null
        })
    }

    /**
     * UPDATE STATUS INVOICE
     * 
     * Mengubah status invoice dan menambahkan data payment jika ada.
     * Digunakan saat menerima callback dari payment gateway.
     * 
     * @param id - ID invoice yang akan diupdate
     * @param status - Status baru (harus valid enum InvoiceStatus)
     * @param paymentData - Data tambahan dari payment gateway (optional)
     * @param paymentData.paymentType - Jenis pembayaran (bank_transfer, etc)
     * @param paymentData.bank - Nama bank jika bank transfer
     * @param paymentData.vaNumber - Virtual account number
     * @param paymentData.gatewayResponse - Raw response dari gateway
     * @returns Invoice yang sudah diupdate
     * @throws 'Invalid Status' jika status tidak valid
     * @throws 'Invoice not found' jika ID tidak ditemukan
     */
    async updateStatus(id: string, status: InvoiceStatus, paymentData?: any) {
        if (!Object.values(InvoiceStatus).includes(status)) {
            throw new Error('Invalid Status')
        }

        const em = getEntityManager() // MikroORM: Ambil EntityManager untuk database operations
        
        // MikroORM Transaction: Wrap operasi dalam transaction untuk data consistency
        return await em.transactional(async (em) => {
            // MikroORM: Query untuk cari invoice berdasarkan ID dengan soft delete filter
            const invoice = await em.findOne(Invoice, { id, deletedAt: null })
            if (!invoice) throw new Error('Invoice not found')
            
            // MikroORM: Update entity properties (akan auto-detect sebagai dirty)
            invoice.status = status
            if (paymentData) {
                invoice.paymentType = paymentData.paymentType
                invoice.bank = paymentData.bank
                invoice.vaNumber = paymentData.vaNumber
                invoice.gatewayResponse = paymentData.gatewayResponse
                if (status === InvoiceStatus.PAID) {
                    invoice.paidAt = new Date()
                }
            }
            
            // MikroORM: Flush perubahan ke database (akan di-commit saat transaction selesai)
            await em.flush()
            return invoice
        })
    }

    /**
     * UPDATE STATUS BY ORDER ID
     * 
     * Method khusus untuk Midtrans callback yang hanya punya orderId.
     * Lebih efisien karena tidak perlu 2 query (find + update).
     * 
     * @param orderId - Kode unik invoice dari Midtrans
     * @param status - Status baru (PAID, FAILED, EXPIRED, PENDING)
     * @param paymentData - Data payment dari Midtrans (optional)
     * @returns Invoice yang sudah diupdate
     * @throws 'Invalid Status' jika status tidak valid
     * @throws 'Invoice not found' jika orderId tidak ditemukan
     * 
     * @example
     * // Dari Midtrans webhook
     * await invoiceService.updateStatusByOrderId(
     *   'INV-123', 
     *   InvoiceStatus.PAID, 
     *   { paymentType: 'bank_transfer', bank: 'bca' }
     * )
     */
    async updateStatusByOrderId(orderId: string, status: InvoiceStatus, paymentData?: any) {
        if (!Object.values(InvoiceStatus).includes(status)) {
            throw new Error('Invalid Status')
        }

        const em = getEntityManager() // MikroORM: Ambil EntityManager untuk database operations
        
        // MikroORM Transaction: Wrap operasi dalam transaction untuk data consistency
        return await em.transactional(async (em) => {
            // MikroORM: Query untuk cari invoice berdasarkan orderId dengan soft delete filter
            const invoice = await em.findOne(Invoice, { orderId, deletedAt: null })
            if (!invoice) {
                throw new Error(`Invoice with orderId ${orderId} not found`)
            }
            
            // MikroORM: Update entity properties (akan auto-detect sebagai dirty)
            invoice.status = status
            
            if (paymentData) {
                invoice.paymentType = paymentData.paymentType
                invoice.bank = paymentData.bank
                invoice.vaNumber = paymentData.vaNumber
                invoice.gatewayResponse = paymentData.gatewayResponse
                
                if (status === InvoiceStatus.PAID) {
                    invoice.paidAt = new Date()
                }
            }
            
            // MikroORM: Flush perubahan ke database (akan di-commit saat transaction selesai)
            await em.flush()
            return invoice
        })
    }


    //callback dari midtrans ke hono lalu ke user
    async handleMidtransCallback(orderId: string, transactionStatus: string, rawResponse: any) {
        const em = getEntityManager()
        // 1. Validasi input
        return await em.transactional(async (em) => {
            if (!orderId || !transactionStatus){
                throw new Error('INVALID_CALLBACK_DATA')
            }

            //2. Ambil invoice dengan select for update
            const invoice = await em.findOne(Invoice, {orderId, deletedAt: null}, {
                lockMode: LockMode.PESSIMISTIC_WRITE 
            })

            if (!invoice) {
                throw new Error('INVOICE_NOT_FOUND')
            }

            // 3. Proses sesuai status
            let newStatus: InvoiceStatus
            switch (transactionStatus) {
            case'settlement':
            case 'capture':
                    newStatus = InvoiceStatus.PAID
                    break
                case 'pending':
                    newStatus = InvoiceStatus.PENDING
                    break
                case 'expire':
                case 'cancel':
                    newStatus = InvoiceStatus.EXPIRED
                    break
                case 'deny':
                case 'failure':
                    newStatus = InvoiceStatus.FAILED
                    break
                default:
                    throw new Error ('INVALID_TRANSACTION_STATUS')
            }

            // 4. Idempotency check - jika status sudah sama, skip update
            if (invoice.status === newStatus) {
                console.info(`Idempotent callback for ${orderId}: status already ${newStatus}`)
                return invoice
            }
            
            // 5. Update database dengan status baru dan raw response audit
            invoice.status = newStatus
            invoice.gatewayResponse = JSON.stringify(rawResponse)
            
            if (newStatus === InvoiceStatus.PAID) {
                invoice.paidAt = new Date()
            }
            
            await em.flush()
            
            // 6. Log successful update
            console.info(`Invoice ${orderId} status updated: ${invoice.status}`)
            
            return invoice
        })
    }

    /**
     * ATOMIC STATUS UPDATE FROM PENDING
     * 
     * Event-based atomic transition: Semua callback Midtrans valid hanya dari PENDING.
     * Menghilangkan ketergantungan pada SELECT sebelumnya.
     * 
     * @param orderId - Order ID invoice
     * @param newStatus - Status baru yang akan di-set
     * @param paymentData - Data payment dari Midtrans
     * @returns 'SUCCESS' jika berhasil update, 'NOOP' jika tidak ada perubahan
     */
    async updateStatusAtomicFromPending(
        orderId: string, 
        newStatus: InvoiceStatus, 
        paymentData?: any
    ): Promise<'SUCCESS' | 'NOOP'> {
        const em = getEntityManager()
        
        // ATOMIC UPDATE tanpa transaction wrapper - lebih cepat & deterministik
        const updateData: any = {
        status: newStatus,
        updatedAt: new Date()
        }
        
        if (paymentData) {
        updateData.paymentType = paymentData.payment_type
        updateData.bank = paymentData.bank
        updateData.vaNumber = paymentData.va_number
        updateData.gatewayResponse = JSON.stringify(paymentData)
        
        if (newStatus === InvoiceStatus.PAID) {
            updateData.paidAt = new Date()
        }
        }
        
        // COMPARE-AND-SET: Update hanya jika status = PENDING
        const result = await em.nativeUpdate(Invoice, 
        { 
            orderId, 
            status: InvoiceStatus.PENDING,  // KUNCI: Hanya dari PENDING
            deletedAt: null 
        }, 
        updateData
        )
        
        return result > 0 ? 'SUCCESS' : 'NOOP'
    }
}