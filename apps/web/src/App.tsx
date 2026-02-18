import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/protected-route';
import { RoleRoute } from './auth/role-route';
import { AppShell } from './components/layout/app-shell';
import { AdminCertificatesPage } from './pages/admin/admin-certificates-page';
import { AdminDashboardPage } from './pages/admin/admin-dashboard-page';
import { AdminReportsPage } from './pages/admin/admin-reports-page';
import { BatchManagementPage } from './pages/admin/batch-management-page';
import { CourseManagementPage } from './pages/admin/course-management-page';
import { StudentManagementPage } from './pages/admin/student-management-page';
import { ExamManagementPage } from './pages/faculty/exam-management-page';
import { ExamScoresPage } from './pages/faculty/exam-scores-page';
import { FacultyDashboardPage } from './pages/faculty/faculty-dashboard-page';
import { FacultyQuestionsPage } from './pages/faculty/questions-page';
import { LoginPage } from './pages/public/login-page';
import { RegisterPage } from './pages/public/register-page';
import { VerificationPage } from './pages/public/verification-page';
import { HomeRedirect } from './pages/shared/home-redirect';
import { NotFoundPage } from './pages/shared/not-found-page';
import { AdminManagementPage } from './pages/super-admin/admin-management-page';
import { CertificatesPage } from './pages/student/certificates-page';
import { EnrollmentPage } from './pages/student/enrollment-page';
import { ExamAttemptPage } from './pages/student/exam-attempt-page';
import { MyCoursesPage } from './pages/student/my-courses-page';
import { ResultsPage } from './pages/student/results-page';
import { StudentDashboardPage } from './pages/student/student-dashboard-page';

export function App() {
  return (
    <Routes>
      <Route element={<HomeRedirect />} path="/" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<RegisterPage />} path="/register" />
      <Route element={<VerificationPage />} path="/verify" />
      <Route element={<VerificationPage />} path="/verify/:certificateNo" />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />} path="/app">
          <Route element={<HomeRedirect />} index />

          <Route element={<RoleRoute allowed={['SUPER_ADMIN']} />}>
            <Route element={<AdminManagementPage />} path="super-admin/admins" />
          </Route>

          <Route element={<RoleRoute allowed={['ADMIN', 'SUPER_ADMIN']} />}>
            <Route element={<AdminDashboardPage />} path="admin/dashboard" />
            <Route element={<CourseManagementPage />} path="admin/courses" />
            <Route element={<BatchManagementPage />} path="admin/batches" />
            <Route element={<StudentManagementPage />} path="admin/students" />
            <Route element={<AdminReportsPage />} path="admin/reports" />
            <Route element={<AdminCertificatesPage />} path="admin/certificates" />
          </Route>

          <Route element={<RoleRoute allowed={['FACULTY']} />}>
            <Route element={<ExamManagementPage />} path="faculty/exams" />
            <Route element={<FacultyQuestionsPage />} path="faculty/questions" />
            <Route element={<ExamScoresPage />} path="faculty/results" />
            <Route element={<FacultyDashboardPage />} path="faculty/dashboard" />
            <Route element={<ExamScoresPage />} path="faculty/scores" />
          </Route>

          <Route element={<RoleRoute allowed={['STUDENT']} />}>
            <Route element={<MyCoursesPage />} path="student/my-courses" />
            <Route element={<ExamAttemptPage />} path="student/exams" />
            <Route element={<EnrollmentPage />} path="student/enrollments" />
            <Route element={<StudentDashboardPage />} path="student/dashboard" />
            <Route element={<ExamAttemptPage />} path="student/exam-attempt" />
            <Route element={<ResultsPage />} path="student/results" />
            <Route element={<CertificatesPage />} path="student/certificates" />
          </Route>

          <Route element={<Navigate replace to="/app" />} path="*" />
        </Route>
      </Route>

      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
