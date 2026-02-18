export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'FACULTY' | 'STUDENT';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type PublicUser = {
  userId: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: PublicUser;
};

export type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

export type AdminDashboardResponse = {
  totals: {
    totalStudents: number;
    totalCourses: number;
    totalExams: number;
  };
  passFailAnalytics: {
    totalEvaluated: number;
    passCount: number;
    failCount: number;
    passRate: number;
    averageScore: number;
  };
  passFailByExam: Array<{
    examId: string;
    examTitle: string;
    evaluatedCount: number;
    passCount: number;
    failCount: number;
    passRate: number;
    averageScore: number;
  }>;
};

export type FacultyDashboardResponse = {
  performanceStatistics: {
    totalExams: number;
    evaluatedAttempts: number;
    passCount: number;
    failCount: number;
    passRate: number;
    averageScore: number;
  };
  examPerformance: Array<{
    examId: string;
    examTitle: string;
    evaluatedAttempts: number;
    passCount: number;
    failCount: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
  }>;
};

export type FacultyExamScoresResponse = {
  examId: string;
  examTitle: string;
  studentScores: Array<{
    studentId: string;
    name: string;
    email: string;
    attemptNo: number;
    marksObtained: number;
    maxMarks: number;
    scorePercentage: number;
    passed: boolean;
    evaluatedAt: string;
  }>;
};

export type StudentDashboardResponse = {
  summary: {
    totalEnrolledCourses: number;
    totalAttemptedExams: number;
    totalResults: number;
    passedResults: number;
    failedResults: number;
  };
  enrolledCourses: Array<{
    enrollmentId: string;
    enrollmentStatus: string;
    enrolledAt: string;
    courseId: string;
    courseName: string;
    durationDays: number;
    batchId: string;
    batchName: string;
    batchStartDate: string;
    batchEndDate: string;
  }>;
  attemptedExams: Array<{
    examId: string;
    examTitle: string;
    attemptsCount: number;
    latestAttemptNo: number;
    lastAttemptAt: string;
    bestScore: number;
  }>;
  results: Array<{
    resultId: string;
    examId: string;
    examTitle: string;
    marksObtained: number;
    maxMarks: number;
    scorePercentage: number;
    passed: boolean;
    evaluatedAt: string;
  }>;
};

export type StudentResultRow = {
  resultId: string;
  attemptId: string;
  examId: string;
  examTitle: string;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  maxMarks: number;
  marksObtained: number;
  scorePercentage: number;
  passed: boolean;
  evaluatedAt: string;
  certificateNo: string | null;
  certificateDownloadUrl: string | null;
};

export type StudentCertificate = {
  certificateId: string;
  certificateNo: string;
  courseName: string | null;
  scorePercentage: number;
  passedAt: string;
  issuedAt: string;
  revoked: boolean;
  downloadUrl: string;
  verificationUrl: string;
  verificationApiUrl: string;
};

export type VerificationResponse =
  | {
      valid: true;
      status: 'VALID';
      certificateNumber: string;
      studentName: string | null;
      course: string | null;
      issueDate: string;
    }
  | {
      valid: false;
      status: 'INVALID';
      certificateNumber: string;
      message: 'Invalid Certificate';
    };
