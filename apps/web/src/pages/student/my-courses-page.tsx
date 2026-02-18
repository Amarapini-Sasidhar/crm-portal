import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { StudentDashboardResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDate, formatDateTime } from '../../lib/format';

export function MyCoursesPage() {
  const [batchId, setBatchId] = useState('');
  const [data, setData] = useState<StudentDashboardResponse | null>(null);

  const dashboardTask = useApiTask();
  const enrollTask = useApiTask();

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    const response = await dashboardTask.run(() =>
      apiRequest<StudentDashboardResponse>(endpoints.student.dashboard)
    );
    if (response) {
      setData(response);
    }
  }

  async function onEnroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await enrollTask.run(
      () =>
        apiRequest<{
          enrollmentId: string;
          studentId: string;
          batchId: string;
          status: string;
          enrolledAt: string;
        }>(endpoints.student.enrollments, {
          method: 'POST',
          body: {
            batchId: batchId.trim()
          }
        }),
      'Enrollment completed.'
    );

    if (!response) {
      return;
    }

    setBatchId('');
    await loadDashboard();
  }

  return (
    <div className="page-grid">
      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadDashboard()} type="button">
            Refresh
          </button>
        }
        subtitle="Enroll in a new batch and view all your enrolled courses."
        title="My Courses"
      >
        <form className="inline-form" onSubmit={onEnroll}>
          <input
            onChange={(event) => setBatchId(event.target.value)}
            placeholder="Enter batch ID"
            required
            value={batchId}
          />
          <button className="btn" disabled={enrollTask.loading} type="submit">
            {enrollTask.loading ? 'Enrolling...' : 'Enroll'}
          </button>
        </form>

        {dashboardTask.error && <ErrorMessage message={dashboardTask.error} />}
        {enrollTask.error && <ErrorMessage message={enrollTask.error} />}
        {enrollTask.success && <SuccessMessage message={enrollTask.success} />}
      </Panel>

      <Panel subtitle="Current enrolled courses from dashboard API." title="Course Enrollments">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Batch</th>
                <th>Status</th>
                <th>Course Duration</th>
                <th>Batch Duration</th>
                <th>Enrolled At</th>
              </tr>
            </thead>
            <tbody>
              {data?.enrolledCourses.map((course) => (
                <tr key={course.enrollmentId}>
                  <td>{course.courseName}</td>
                  <td>{course.batchName}</td>
                  <td>{course.enrollmentStatus}</td>
                  <td>{course.durationDays} days</td>
                  <td>
                    {formatDate(course.batchStartDate)} - {formatDate(course.batchEndDate)}
                  </td>
                  <td>{formatDateTime(course.enrolledAt)}</td>
                </tr>
              ))}
              {!data?.enrolledCourses.length && (
                <tr>
                  <td colSpan={6}>No enrolled courses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
