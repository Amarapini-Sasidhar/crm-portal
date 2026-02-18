BEGIN;

CREATE TABLE IF NOT EXISTS crm.batch_faculty_assignments (
  assignment_id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL UNIQUE REFERENCES crm.batches(batch_id) ON DELETE CASCADE,
  faculty_id BIGINT NOT NULL REFERENCES crm.users(user_id) ON DELETE RESTRICT,
  assigned_by BIGINT NOT NULL REFERENCES crm.users(user_id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_faculty_assignments_faculty_id
  ON crm.batch_faculty_assignments(faculty_id);

COMMIT;
