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
    await this.normalizeRoleValidationFunctions();
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

  private async normalizeRoleValidationFunctions() {
    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION crm.fn_assert_user_role(p_user_id bigint, p_allowed text[])
      RETURNS void
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        v_role text;
      BEGIN
        SELECT role::text INTO v_role
        FROM crm.users
        WHERE user_id = p_user_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'User % does not exist', p_user_id;
        END IF;

        IF NOT (v_role = ANY (p_allowed)) THEN
          RAISE EXCEPTION 'User % has role %, allowed roles: %', p_user_id, v_role, p_allowed;
        END IF;
      END;
      $function$;
    `);

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION crm.fn_validate_course_creator()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        PERFORM crm.fn_assert_user_role(NEW.created_by, ARRAY['SUPER_ADMIN', 'ADMIN']);
        RETURN NEW;
      END;
      $function$;
    `);

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION crm.fn_validate_batch_creator()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        PERFORM crm.fn_assert_user_role(NEW.created_by, ARRAY['SUPER_ADMIN', 'ADMIN']);
        RETURN NEW;
      END;
      $function$;
    `);

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION crm.fn_validate_enrollment_roles()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        PERFORM crm.fn_assert_user_role(NEW.student_id, ARRAY['STUDENT']);
        PERFORM crm.fn_assert_user_role(NEW.created_by, ARRAY['SUPER_ADMIN', 'ADMIN', 'STUDENT']);
        RETURN NEW;
      END;
      $function$;
    `);

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION crm.fn_validate_exam_creator()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        PERFORM crm.fn_assert_user_role(NEW.created_by_faculty_id, ARRAY['FACULTY']);
        RETURN NEW;
      END;
      $function$;
    `);

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION crm.fn_validate_exam_attempt()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        v_batch_id BIGINT;
        v_max_attempts SMALLINT;
        v_exam_status exam_status;
        v_starts_at TIMESTAMPTZ;
        v_ends_at TIMESTAMPTZ;
        v_started_at TIMESTAMPTZ;
      BEGIN
        PERFORM crm.fn_assert_user_role(NEW.student_id, ARRAY['STUDENT']);

        SELECT batch_id, max_attempts, status, starts_at, ends_at
        INTO v_batch_id, v_max_attempts, v_exam_status, v_starts_at, v_ends_at
        FROM crm.exams
        WHERE exam_id = NEW.exam_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Exam % does not exist', NEW.exam_id;
        END IF;

        IF NEW.attempt_no > v_max_attempts THEN
          RAISE EXCEPTION 'Attempt number % exceeds max attempts % for exam %', NEW.attempt_no, v_max_attempts, NEW.exam_id;
        END IF;

        v_started_at := COALESCE(NEW.started_at, NOW());

        IF v_exam_status <> 'PUBLISHED' THEN
          RAISE EXCEPTION 'Exam % is not published', NEW.exam_id;
        END IF;

        IF v_starts_at IS NOT NULL AND v_started_at < v_starts_at THEN
          RAISE EXCEPTION 'Exam % has not started yet', NEW.exam_id;
        END IF;

        IF v_ends_at IS NOT NULL AND v_started_at > v_ends_at THEN
          RAISE EXCEPTION 'Exam % has ended', NEW.exam_id;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM crm.student_enrollments se
          WHERE se.student_id = NEW.student_id
            AND se.batch_id = v_batch_id
            AND se.status IN ('ACTIVE', 'COMPLETED')
        ) THEN
          RAISE EXCEPTION 'Student % is not enrolled in batch %', NEW.student_id, v_batch_id;
        END IF;

        RETURN NEW;
      END;
      $function$;
    `);

    this.logger.log('Normalized role-validation functions to text[] signatures.');
  }
}
