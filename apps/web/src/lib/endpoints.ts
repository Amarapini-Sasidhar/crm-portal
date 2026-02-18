export const endpoints = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    me: '/auth/me'
  },
  superAdmin: {
    admins: '/super-admin/admins',
    adminStatus: (userId: string) => `/super-admin/admins/${userId}/status`
  },
  admin: {
    dashboard: '/admin/dashboard',
    courses: '/admin/courses',
    batches: '/admin/batches',
    batchFaculty: (batchId: string) => `/admin/batches/${batchId}/faculty`,
    students: '/admin/students',
    studentStatus: (userId: string) => `/admin/students/${userId}/status`,
    reports: '/admin/reports',
    certificates: '/admin/certificates'
  },
  faculty: {
    dashboard: '/faculty/dashboard',
    examScores: (examId: string) => `/faculty/dashboard/exams/${examId}/scores`,
    exams: '/faculty/exams',
    examById: (examId: string) => `/faculty/exams/${examId}`,
    uploadQuestionImage: '/faculty/questions/images',
    addQuestion: (examId: string) => `/faculty/exams/${examId}/questions`,
    results: '/faculty/results'
  },
  student: {
    dashboard: '/student/dashboard',
    enrollments: '/student/enrollments',
    startExamLegacy: (examId: string) => `/student/exams/${examId}/attempts`,
    startExam: (examId: string) => `/student/exams/${examId}/attempts/start`,
    saveAnswers: (attemptId: string) => `/student/attempts/${attemptId}/answers`,
    heartbeat: (attemptId: string) => `/student/attempts/${attemptId}/heartbeat`,
    securityEvents: (attemptId: string) => `/student/attempts/${attemptId}/security-events`,
    submitAttempt: (attemptId: string) => `/student/attempts/${attemptId}/submit`,
    attemptState: (attemptId: string) => `/student/attempts/${attemptId}`,
    results: '/student/results',
    certificates: '/student/certificates',
    certificateDownload: (certificateNo: string) =>
      `/student/certificates/${certificateNo}/download`
  },
  certificates: {
    verify: (certificateNo: string) => `/certificates/verify/${certificateNo}`,
    verifyPage: (certificateNo: string) => `/certificates/verify/${certificateNo}/page`
  }
} as const;
