import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

type UserColumnMetadata = {
  column_name: 'role' | 'status';
  data_type: string;
  udt_name: string;
};

@Injectable()
export class UserSchemaMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(UserSchemaMaintenanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.normalizeUsersEnumColumns();
  }

  private async normalizeUsersEnumColumns() {
    const columns = (await this.dataSource.query(
      `
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'crm'
          AND table_name = 'users'
          AND column_name IN ('role', 'status')
      `
    )) as UserColumnMetadata[];

    for (const column of columns) {
      if (column.data_type === 'character varying' || column.data_type === 'text') {
        continue;
      }

      const columnName = column.column_name;
      const usingExpression = column.udt_name.startsWith('_')
        ? `${columnName}[1]::text`
        : `${columnName}::text`;

      await this.dataSource.query(
        `ALTER TABLE crm.users ALTER COLUMN ${columnName} DROP DEFAULT`
      );
      await this.dataSource.query(
        `ALTER TABLE crm.users ALTER COLUMN ${columnName} TYPE varchar(30) USING ${usingExpression}`
      );

      if (columnName === 'status') {
        await this.dataSource.query(
          `ALTER TABLE crm.users ALTER COLUMN status SET DEFAULT 'ACTIVE'`
        );
      }

      this.logger.log(`Normalized crm.users.${columnName} to varchar(30).`);
    }
  }
}
