import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

type CertificateColumnMetadata = {
  column_name: string;
};

@Injectable()
export class CertificateSchemaMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(CertificateSchemaMaintenanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureCertificateColumns();
    await this.relaxCourseCertificateForeignKeys();
    await this.disableLegacyCertificateValidationTrigger();
  }

  private async ensureCertificateColumns() {
    const existingColumns = (await this.dataSource.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'crm'
          AND table_name = 'certificates'
      `
    )) as CertificateColumnMetadata[];

    const existing = new Set(existingColumns.map((column) => column.column_name));
    const missingStatements: Array<{ column: string; statement: string }> = [];

    if (!existing.has('exam_id')) {
      missingStatements.push({
        column: 'exam_id',
        statement: `ALTER TABLE crm.certificates ADD COLUMN exam_id BIGINT NULL`
      });
    }

    if (!existing.has('course_id')) {
      missingStatements.push({
        column: 'course_id',
        statement: `ALTER TABLE crm.certificates ADD COLUMN course_id BIGINT NULL`
      });
    }

    if (!existing.has('faculty_id')) {
      missingStatements.push({
        column: 'faculty_id',
        statement: `ALTER TABLE crm.certificates ADD COLUMN faculty_id BIGINT NULL`
      });
    }

    if (!existing.has('revoked')) {
      missingStatements.push({
        column: 'revoked',
        statement: `ALTER TABLE crm.certificates ADD COLUMN revoked BOOLEAN NOT NULL DEFAULT FALSE`
      });
    }

    if (!existing.has('revoked_at')) {
      missingStatements.push({
        column: 'revoked_at',
        statement: `ALTER TABLE crm.certificates ADD COLUMN revoked_at TIMESTAMPTZ NULL`
      });
    }

    for (const item of missingStatements) {
      await this.dataSource.query(item.statement);
      this.logger.log(`Added missing crm.certificates.${item.column} column.`);
    }
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

  private async disableLegacyCertificateValidationTrigger() {
    const triggers = (await this.dataSource.query(
      `
        SELECT DISTINCT trigger_info.tgname AS "triggerName"
        FROM (
          SELECT
            t.tgname,
            p.proname
          FROM pg_trigger t
          INNER JOIN pg_class c ON c.oid = t.tgrelid
          INNER JOIN pg_namespace n ON n.oid = c.relnamespace
          INNER JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE n.nspname = 'crm'
            AND c.relname = 'certificates'
            AND NOT t.tgisinternal
        ) trigger_info
        WHERE trigger_info.proname = 'fn_validate_certificate_issue'
           OR trigger_info.tgname = 'trg_validate_certificate_issue'
      `
    )) as Array<{ triggerName: string }>;

    for (const trigger of triggers) {
      await this.dataSource.query(
        `DROP TRIGGER IF EXISTS "${trigger.triggerName}" ON crm.certificates`
      );
      this.logger.log(`Dropped certificate trigger ${trigger.triggerName}.`);
    }
  }
}
