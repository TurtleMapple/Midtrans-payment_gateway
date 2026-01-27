import { Migration } from '@mikro-orm/migrations';

export class Migration20260127084418 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`invoices\` modify \`id\` varchar(36) not null, modify \`created_at\` datetime not null, modify \`updated_at\` datetime not null;`);
    this.addSql(`alter table \`invoices\` drop index \`order_id\`;`);
    this.addSql(`alter table \`invoices\` add unique \`invoices_order_id_unique\`(\`order_id\`);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`invoices\` modify \`id\` bigint not null auto_increment, modify \`created_at\` datetime not null default CURRENT_TIMESTAMP, modify \`updated_at\` datetime not null default CURRENT_TIMESTAMP on update CURRENT_TIMESTAMP;`);
    this.addSql(`alter table \`invoices\` drop index \`invoices_order_id_unique\`;`);
    this.addSql(`alter table \`invoices\` add unique \`order_id\`(\`order_id\`);`);
  }

}
