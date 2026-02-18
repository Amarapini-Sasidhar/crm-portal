BEGIN;

CREATE SCHEMA IF NOT EXISTS crm;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'attempt_status' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm.attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'EXPIRED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'security_event_type' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm.security_event_type AS ENUM (
      'TAB_SWITCH',
      'FULLSCREEN_EXIT',
      'COPY_PASTE',
      'DEVTOOLS_OPEN',
      'MULTIPLE_FACE_DETECTED',
      'IP_MISMATCH',
      'USER_AGENT_MISMATCH',
      'AUTO_SUBMIT'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS crm.exam_attempts (
  attempt_id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES crm.exams(exam_id) ON DELETE RESTRICT,
  student_id BIGINT NOT NULL REFERENCES crm.users(user_id) ON DELETE RESTRICT,
  attempt_no SMALLINT NOT NULL CHECK (attempt_no > 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  status crm.attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
  time_spent_seconds INTEGER CHECK (time_spent_seconds IS NULL OR time_spent_seconds >= 0),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_exam_attempt_student_exam_attemptno UNIQUE (student_id, exam_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_student
  ON crm.exam_attempts(exam_id, student_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempts_single_inprogress
  ON crm.exam_attempts(student_id, exam_id)
  WHERE status = 'IN_PROGRESS';

CREATE TABLE IF NOT EXISTS crm.attempt_answers (
  attempt_answer_id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES crm.exam_attempts(attempt_id) ON DELETE CASCADE,
  exam_id BIGINT NOT NULL REFERENCES crm.exams(exam_id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES crm.exam_questions(question_id) ON DELETE CASCADE,
  selected_option_id BIGINT REFERENCES crm.question_options(option_id) ON DELETE RESTRICT,
  answered_at TIMESTAMPTZ,
  is_marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attempt_answer_attempt_question UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt_id
  ON crm.attempt_answers(attempt_id);

CREATE TABLE IF NOT EXISTS crm.exam_results (
  result_id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL UNIQUE REFERENCES crm.exam_attempts(attempt_id) ON DELETE CASCADE,
  exam_id BIGINT NOT NULL REFERENCES crm.exams(exam_id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES crm.users(user_id) ON DELETE CASCADE,
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  correct_answers INTEGER NOT NULL CHECK (correct_answers >= 0),
  wrong_answers INTEGER NOT NULL CHECK (wrong_answers >= 0),
  unanswered INTEGER NOT NULL CHECK (unanswered >= 0),
  max_marks NUMERIC(8, 2) NOT NULL CHECK (max_marks > 0),
  marks_obtained NUMERIC(8, 2) NOT NULL CHECK (marks_obtained >= 0 AND marks_obtained <= max_marks),
  score_percentage NUMERIC(5, 2)
    GENERATED ALWAYS AS (ROUND((marks_obtained * 100.0) / max_marks, 2)) STORED,
  passed BOOLEAN
    GENERATED ALWAYS AS (((marks_obtained * 100.0) / max_marks) >= 70.00) STORED,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_exam_result_counts
    CHECK (correct_answers + wrong_answers + unanswered = total_questions)
);

CREATE INDEX IF NOT EXISTS idx_exam_results_student_exam
  ON crm.exam_results(student_id, exam_id);

CREATE TABLE IF NOT EXISTS crm.attempt_security_events (
  event_id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES crm.exam_attempts(attempt_id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES crm.users(user_id) ON DELETE CASCADE,
  event_type crm.security_event_type NOT NULL,
  event_data JSONB,
  risk_score SMALLINT NOT NULL DEFAULT 0 CHECK (risk_score >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempt_security_events_attempt
  ON crm.attempt_security_events(attempt_id, occurred_at DESC);

COMMIT;
