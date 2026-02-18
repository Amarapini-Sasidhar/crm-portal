import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { StudentDashboardResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { StatCard } from '../../components/ui/stat-card';
import { ErrorMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime, formatPercent } from '../../lib/format';

export function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const task = useApiTask();

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    const response = await task.run(() =>
      apiRequest<StudentDashboardResponse>(endpoints.student.dashboard)
    );
    if (response) {
      setData(response);
    }
  }

  return (
    <div className="page-grid">
      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadDashboard()} type="button">
            Refresh
          </button>
        }
        subtitle="Enrollment and result overview."
        title="Student Dashboard"
      >
        {task.error && <ErrorMessage message={task.error} />}
        {data && (
          <div className="stat-grid">
            <StatCard
              label="Enrolled Courses"
              value={data.summary.totalEnrolledCourses}
            />
            <StatCard label="Attempted Exams" value={data.summary.totalAttemptedExams} />
            <StatCard label="Passed Results" value={data.summary.passedResults} />
            <StatCard label="Failed Results" value={data.summary.failedResults} />
          </div>
        )}
      </Panel>

      <Panel subtitle="Your enrollments" title="Enrolled Courses">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Batch</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Enrolled At</th>
              </tr>
            </thead>
            <tbody>
              {data?.enrolledCourses.map((row) => (
                <tr key={row.enrollmentId}>
                  <td>{row.courseName}</td>
                  <td>{row.batchName}</td>
                  <td>{row.enrollmentStatus}</td>
                  <td>{row.durationDays} days</td>
                  <td>{formatDateTime(row.enrolledAt)}</td>
                </tr>
              ))}
              {!data?.enrolledCourses.length && (
                <tr>
                  <td colSpan={5}>No enrollments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel subtitle="Exam attempts summary." title="Attempted Exams">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Attempts</th>
                <th>Latest Attempt</th>
                <th>Best Score</th>
                <th>Last Attempt</th>
              </tr>
            </thead>
            <tbody>
              {data?.attemptedExams.map((row) => (
                <tr key={row.examId}>
                  <td>{row.examTitle}</td>
                  <td>{row.attemptsCount}</td>
                  <td>#{row.latestAttemptNo}</td>
                  <td>{formatPercent(row.bestScore)}</td>
                  <td>{formatDateTime(row.lastAttemptAt)}</td>
                </tr>
              ))}
              {!data?.attemptedExams.length && (
                <tr>
                  <td colSpan={5}>No attempted exams found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
