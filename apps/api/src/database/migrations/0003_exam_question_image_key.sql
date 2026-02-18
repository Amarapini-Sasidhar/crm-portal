BEGIN;

ALTER TABLE crm.exam_questions
  ADD COLUMN IF NOT EXISTS image_key TEXT;

COMMIT;
