import { Entity, PrimaryKey, Property } from '@mikro-orm/core'
import { InvoiceStatus } from './InvoiceStatus'

@Entity({ tableName: 'invoices' })
export class Invoice {
  @PrimaryKey({ type: 'bigint' })
  id!: number

  @Property({ type: 'string', length: 64, unique: true })
  orderId!: string

  @Property({ type: 'int' })
  amount!: number

  @Property({ type: 'string', length: 32, default: InvoiceStatus.PENDING })
  status!: InvoiceStatus

  @Property({ type: 'string', length: 32, nullable: true })
  paymentType?: string

  @Property({ type: 'string', length: 32, nullable: true })
  bank?: string

  @Property({ type: 'string', length: 64, nullable: true })
  vaNumber?: string

  @Property({ type: 'datetime', nullable: true })
  expiredAt?: Date

  @Property({ type: 'datetime', nullable: true })
  paidAt?: Date

  @Property({ type: 'string', length: 32, default: 'midtrans' })
  gateway!: string

  @Property({ type: 'json', nullable: true })
  gatewayResponse?: any

  @Property({ type: 'datetime' })
  createdAt = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt = new Date()

  @Property({ type: 'datetime', nullable: true })
  deletedAt?: Date

  @Property({ type: 'string', length: 255, nullable: true })
  paymentLink?: string

  @Property({ type: 'datetime', nullable: true})
  paymentLinkCreatedAt?: Date

  @Property({ type: 'int', default: 0 })
  paymentAttemptCount!: number
}