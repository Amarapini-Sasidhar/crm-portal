import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CertificateSchemaMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(CertificateSchemaMaintenanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.relaxCourseCertificateForeignKeys();
  }

  private async relaxCourseCertificateForeignKeys() {
    const constraints = (await this.dataSource.query(
      `
        SELECT DISTINCT con.conname AS "constraintName"
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace rel_ns ON rel_ns.oid = rel.relnamespace
        INNER JOIN unnest(con.conkey) AS key(attnum) ON TRUE
        INNER JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = key.attnum
        WHERE rel_ns.nspname = 'crm'
          AND rel.relname = 'certificates'
          AND con.contype = 'f'
          AND attr.attname IN ('result_id', 'exam_id')
      `
    )) as Array<{ constraintName: string }>;

    for (const constraint of constraints) {
      await this.dataSource.query(
        `ALTER TABLE crm.certificates DROP CONSTRAINT IF EXISTS "${constraint.constraintName}"`
      );
      this.logger.log(`Dropped certificate foreign key ${constraint.constraintName}.`);
    }
  }
}
