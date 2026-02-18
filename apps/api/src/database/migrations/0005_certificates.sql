BEGIN;

CREATE TABLE IF NOT EXISTS crm.certificates (
  certificate_id BIGSERIAL PRIMARY KEY,
  certificate_no VARCHAR(60) NOT NULL UNIQUE,
  result_id BIGINT NOT NULL UNIQUE REFERENCES crm.exam_results(result_id) ON DELETE CASCADE,
  exam_id BIGINT NOT NULL REFERENCES crm.exams(exam_id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES crm.users(user_id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES crm.courses(course_id) ON DELETE RESTRICT,
  faculty_id BIGINT REFERENCES crm.users(user_id) ON DELETE SET NULL,
  score_percentage NUMERIC(5, 2) NOT NULL CHECK (score_percentage >= 75.00 AND score_percentage <= 100.00),
  passed_at TIMESTAMPTZ NOT NULL,
  file_key TEXT NOT NULL,
  qr_payload TEXT NOT NULL,
  verification_token VARCHAR(64) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_certificate_revocation_state CHECK (
    (revoked = FALSE AND revoked_at IS NULL) OR
    (revoked = TRUE AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_certificates_student_id
  ON crm.certificates(student_id);

CREATE INDEX IF NOT EXISTS idx_certificates_exam_id
  ON crm.certificates(exam_id);

CREATE INDEX IF NOT EXISTS idx_certificates_course_id
  ON crm.certificates(course_id);

COMMIT;
