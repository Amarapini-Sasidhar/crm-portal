# CRM Portal Backend (Auth + RBAC)

This implementation adds production-oriented authentication and role-based authorization in `apps/api` using NestJS, PostgreSQL (TypeORM), JWT, and bcrypt.

## Folder Placement

- `apps/api/src/main.ts`: API bootstrap, global prefix (`/api/v1`), global validation.
- `apps/api/src/app.module.ts`: Root module, DB connection config, global guards, middleware binding.
- `apps/api/src/config/env.validation.ts`: Environment schema validation.
- `apps/api/src/common/constants/password-policy.ts`: Shared password complexity policy.
- `apps/api/src/common/decorators/public.decorator.ts`: Marks public endpoints.
- `apps/api/src/common/decorators/roles.decorator.ts`: Role metadata decorator.
- `apps/api/src/common/decorators/current-user.decorator.ts`: Injects authenticated user into handlers.
- `apps/api/src/common/guards/jwt-auth.guard.ts`: JWT route protection guard.
- `apps/api/src/common/guards/roles.guard.ts`: RBAC guard.
- `apps/api/src/common/middleware/bearer-token-format.middleware.ts`: Rejects malformed bearer token headers.
- `apps/api/src/modules/users/*`: User entity and user domain operations.
- `apps/api/src/modules/auth/*`: Registration, login, JWT strategy, auth service/controller.
- `apps/api/src/modules/course-batch/*`: Course, batch, faculty assignment, and student enrollment database interaction + validations.
- `apps/api/src/modules/faculty-exams/*`: Exam creation/edit/delete, question/option persistence, and question image upload logic.
- `apps/api/src/modules/student-attempts/*`: Exam start, timer/heartbeat, answer persistence, auto-submit, evaluation, and anti-cheat security logging.
- `apps/api/src/modules/certificates/*`: Certificate entity, PDF generation, QR payload creation, storage, download, and verification endpoints.
- `apps/api/src/modules/dashboards/*`: Role-based dashboard analytics queries and API aggregation logic.
- `apps/api/src/modules/access/*`: Protected role-specific endpoints (Super Admin/Admin/Faculty/Student).
- `apps/api/src/database/migrations/0002_batch_faculty_assignments.sql`: Migration for batch-faculty assignment table.
- `apps/api/src/database/migrations/0003_exam_question_image_key.sql`: Migration for storing question image references.
- `apps/api/src/database/migrations/0004_student_exam_attempts.sql`: Migration for attempts, answers, results, and anti-cheat event tables.
- `apps/api/src/database/migrations/0005_certificates.sql`: Migration for generated certificate metadata and verification data.
- `apps/api/.env.example`: Required environment variables.

## Security Implementation

- Password hashing: `bcrypt` with configurable rounds (`BCRYPT_SALT_ROUNDS`, default 12).
- JWT authentication: bearer token with configurable secret and expiry.
- Protected routes: global `JwtAuthGuard`; only routes marked with `@Public()` are open.
- RBAC: global `RolesGuard` + `@Roles(...)`.
- Account status enforcement: only `ACTIVE` users can authenticate.
- Input validation: global class-validator pipe with whitelist and non-whitelisted property rejection.
- Uploaded question images are served via `/uploads/*` for UI preview and question rendering.

## API Endpoints

Base URL prefix: `/api/v1`

### Public

- `POST /auth/register`: Student self-registration.
- `POST /auth/login`: Login and JWT issuance.
- `GET /certificates/verify/:certificateNo`: Public certificate verification API returning:
  - valid: `studentName`, `course`, `certificateNumber`, `issueDate`, `status=VALID`
  - invalid/not found: `status=INVALID`, `message=Invalid Certificate`
- `GET /certificates/verify/:certificateNo/page`: Public verification page rendered for QR scans.

### Authenticated

- `GET /auth/me`: Current authenticated user profile.

### Super Admin (`SUPER_ADMIN`)

- `GET /super-admin/admins`: List admin users.
- `POST /super-admin/admins`: Create admin user.
- `PATCH /super-admin/admins/:userId/status`: Update admin status.

### Admin (`ADMIN`, `SUPER_ADMIN`)

- `GET /admin/dashboard`: Total students/courses/exams and pass-fail analytics.
- `POST /admin/courses`: Create course using `{ name, description, duration }`.
- `POST /admin/batches`: Create batch using `{ courseId, facultyId, startDate, endDate, capacity? }`.
- `PATCH /admin/batches/:batchId/faculty`: Assign or reassign faculty to a batch.
- `POST /admin/students`: Create student account.
- `GET /admin/students`: List students.
- `PATCH /admin/students/:userId/status`: Update student status.
- `GET /admin/reports`: Access reports endpoint.
- `GET /admin/certificates`: Access certificates management endpoint.

### Faculty (`FACULTY`)

- `GET /faculty/dashboard`: Faculty performance statistics + exam-wise analytics.
- `GET /faculty/dashboard/exams/:examId/scores`: Student score list for a specific exam.
- `POST /faculty/exams`: Create exam with time limit, batch assignment, and scheduled date.
- `PATCH /faculty/exams/:examId`: Edit exam details.
- `DELETE /faculty/exams/:examId`: Delete exam.
- `POST /faculty/questions/images`: Upload question image (`multipart/form-data`, file field). Returns `imageKey` and `imageUrl`.
- `POST /faculty/exams/:examId/questions`: Add MCQ question with 4 options and one correct answer.
- `GET /faculty/results`: View results endpoint.

### Student (`STUDENT`)

- `GET /student/dashboard`: Enrolled courses, attempted exams, and result summary.
- `POST /student/enrollments`: Enroll student into batch using `{ batchId }`.
- `POST /student/exams/:examId/attempts`: Start exam (legacy route alias).
- `POST /student/exams/:examId/attempts/start`: Start exam attempt.
- `PATCH /student/attempts/:attemptId/answers`: Save selected answers.
- `POST /student/attempts/:attemptId/heartbeat`: Timer heartbeat and anti-cheat telemetry.
- `POST /student/attempts/:attemptId/security-events`: Record explicit anti-cheat event.
- `POST /student/attempts/:attemptId/submit`: Submit exam (manual).
- `GET /student/attempts/:attemptId`: Attempt status snapshot.
- `GET /student/results`: View results endpoint.
- `GET /student/certificates`: List generated certificates for the logged-in student.
- `GET /student/certificates/:certificateNo/download`: Download certificate endpoint.

## Validation Logic (Course/Batch Module)

- Course:
  - `name` is required and unique (case-insensitive).
  - `duration` must be an integer >= 1.
  - system generates a unique `courseCode` for storage.
- Batch:
  - `courseId` must reference an active course.
  - `facultyId` must reference an active `FACULTY` user.
  - `endDate >= startDate`.
  - capacity defaults to `100` when omitted.
  - system generates `batchCode` and `batchName`.
- Faculty assignment:
  - exactly one current faculty assignment per batch (upsert behavior).
  - assignment endpoint validates batch existence and faculty role/status.
- Student enrollment:
  - only active `STUDENT` users can enroll.
  - cannot enroll in completed/cancelled batch.
  - duplicate enrollment blocked per `(studentId, batchId)`.
  - enrollment blocked when batch capacity is full.

## Validation Logic (Faculty Exam Module)

- Exam creation:
  - faculty can create exam only for a batch assigned to that faculty.
  - schedule is validated from `scheduledAt`.
  - `endsAt` is derived from `scheduledAt + timeLimitMinutes`.
  - `totalMarks > 0` and pass percentage is fixed at 70.
- Exam update:
  - only exam owner faculty can edit.
  - if `batchId` changes, new batch must be assigned to the same faculty.
  - `totalMarks` cannot be reduced below current sum of question marks.
- Exam delete:
  - only exam owner faculty can delete.
  - delete is blocked when dependent attempt/result rows exist.
- Question image upload:
  - only JPEG/PNG/WEBP images allowed.
  - max file size is 5MB.
  - files are stored in `uploads/question-images`.
- MCQ add:
  - exactly 4 options.
  - option keys must be unique `A/B/C/D`.
  - exactly 1 correct answer.
  - sum of all question marks cannot exceed exam `totalMarks`.

## Validation Logic (Student Attempt Module)

- Start attempt:
  - exam must be `PUBLISHED` and inside schedule window.
  - student must be enrolled in the exam batch.
  - one active attempt per exam per student.
  - max attempts limit enforced.
- Timer:
  - server computes attempt deadline from `startedAt + duration`.
  - if deadline is reached, attempt auto-submits.
- Answer storage:
  - validates `questionId` belongs to exam.
  - validates `selectedOptionId` belongs to question.
  - upsert behavior per `(attemptId, questionId)`.
- Evaluation:
  - compares selected option with correct option.
  - computes percentage from obtained marks.
  - pass when percentage >= 70.
  - stores in `exam_results`.
- Certificate generation:
  - auto-generated only when score percentage >= 75.
  - unique certificate number format: `CERT-YYYYMM-COURSECD-RESULTID`.
  - PDF stored in `uploads/certificates` and metadata stored in `crm.certificates`.
  - QR payload points to `/api/v1/certificates/verify/:certificateNo/page` with verification token.
- Anti-cheat:
  - logs tab switch, fullscreen exit, copy/paste, devtools open, multiple face detection, IP/user-agent mismatch.
  - severe events trigger forced auto-submit.

## Dashboard Query Coverage

- Admin dashboard queries:
  - total student count (`users` filtered by role `STUDENT`)
  - total course count (`courses`)
  - total exam count (`exams`)
  - pass/fail aggregates and pass rate (`exam_results`)
  - exam-wise pass/fail analytics (`exams` + `exam_results`)
- Faculty dashboard queries:
  - exam-wise score stats for faculty-owned exams (`exams` + `exam_results`)
  - overall faculty performance summary (pass rate, average score, evaluated attempts)
  - per-exam student score listing (`exam_results` + `exam_attempts` + `users`)
- Student dashboard queries:
  - enrolled courses (`student_enrollments` + `batches` + `courses`)
  - attempted exams summary (`exam_attempts` + `exams` + `exam_results`)
  - latest result list (`exam_results` + `exams`)

## Environment

Copy `apps/api/.env.example` to `apps/api/.env` and fill secure values before running.

## Frontend (React + Vite)

Production-style frontend is implemented at `apps/web` and consumes only the existing backend routes under `/api/v1`.

### Frontend Folder Placement

- `apps/web/src/main.tsx`: Web bootstrap, router mount, auth provider wrapper.
- `apps/web/src/App.tsx`: Role-aware route tree and protected route composition.
- `apps/web/src/auth/*`: Auth session context, protected routes, role guards.
- `apps/web/src/lib/api-client.ts`: Shared fetch wrapper, JWT header injection, error handling, download helper.
- `apps/web/src/lib/endpoints.ts`: Central API endpoint map (strictly existing backend endpoints).
- `apps/web/src/lib/auth-storage.ts`: Local storage token/user persistence.
- `apps/web/src/components/layout/app-shell.tsx`: Responsive shell with role navigation.
- `apps/web/src/components/ui/*`: Reusable panel/stat/feedback UI primitives.
- `apps/web/src/pages/public/*`: Login, student registration, and certificate verification page.
- `apps/web/src/pages/super-admin/*`: Admin user management pages.
- `apps/web/src/pages/admin/*`: Admin dashboard + course/batch/student/reports/certificates pages.
- `apps/web/src/pages/faculty/*`: Faculty dashboard, exam creation/update/delete, question/image flow, exam score lookup.
- `apps/web/src/pages/student/*`: Student dashboard, enrollment, live exam attempt flow, results, certificate list/download.
- `apps/web/src/styles/global.css`: Visual system, responsive layout, animations, and form/table styles.
- `apps/web/.env.example`: Frontend runtime API base URL.

### Frontend API Compliance

Frontend requests are restricted to existing backend endpoints:

- Auth: `/auth/register`, `/auth/login`, `/auth/me`
- Super Admin: `/super-admin/admins`, `/super-admin/admins/:userId/status`
- Admin: `/admin/dashboard`, `/admin/courses`, `/admin/batches`, `/admin/batches/:batchId/faculty`, `/admin/students`, `/admin/students/:userId/status`, `/admin/reports`, `/admin/certificates`
- Faculty: `/faculty/dashboard`, `/faculty/dashboard/exams/:examId/scores`, `/faculty/exams`, `/faculty/exams/:examId`, `/faculty/questions/images`, `/faculty/exams/:examId/questions`
- Student: `/student/dashboard`, `/student/enrollments`, `/student/exams/:examId/attempts/start`, `/student/attempts/:attemptId/answers`, `/student/attempts/:attemptId/heartbeat`, `/student/attempts/:attemptId/submit`, `/student/attempts/:attemptId`, `/student/results`, `/student/certificates`, `/student/certificates/:certificateNo/download`
- Certificate verify: `/certificates/verify/:certificateNo`

### Auth UI Notes

- Login page includes role selection (`STUDENT`, `FACULTY`, `ADMIN`) and validates role-account match after backend login response.
- Registration page includes role selection, but only `STUDENT` can self-register because backend public registration endpoint is `/auth/register`.
- JWT access token is stored in browser storage and used for authenticated API requests.
- After successful login, user is redirected to `/app` and then to role-specific dashboard via role routing.

### Dashboard Layout Notes

- Main dashboard layout uses:
  - sidebar navigation
  - top navbar with current user context
  - logout button
- Role-based sidebar menus:
  - `ADMIN`: Courses, Batches, Students, Reports, Certificates
  - `FACULTY`: Exams, Questions, Results
  - `STUDENT`: My Courses, Exams, Results, Certificates
- Unauthorized access protection:
  - `ProtectedRoute` blocks unauthenticated users
  - `RoleRoute` blocks cross-role dashboard access (e.g., student cannot access admin pages)

### Run Frontend

1. Copy `apps/web/.env.example` to `apps/web/.env`.
2. Set `VITE_API_BASE_URL` to backend URL (for example `http://localhost:4000/api/v1`).
3. Run the frontend from `apps/web`:
   - `npm install`
   - `npm run dev`
