import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { AdminDashboardResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { StatCard } from '../../components/ui/stat-card';
import { ErrorMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatPercent } from '../../lib/format';

export function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const task = useApiTask();

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    const response = await task.run(() =>
      apiRequest<AdminDashboardResponse>(endpoints.admin.dashboard)
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
        subtitle="High-level platform and outcome metrics."
        title="Admin Dashboard"
      >
        {task.error && <ErrorMessage message={task.error} />}
        {data && (
          <>
            <div className="stat-grid">
              <StatCard label="Total Students" value={data.totals.totalStudents} />
              <StatCard label="Total Courses" value={data.totals.totalCourses} />
              <StatCard label="Total Exams" value={data.totals.totalExams} />
              <StatCard
                hint={`Pass ${data.passFailAnalytics.passCount} / Fail ${data.passFailAnalytics.failCount}`}
                label="Pass Rate"
                value={formatPercent(data.passFailAnalytics.passRate)}
              />
            </div>
            <div className="stat-grid compact">
              <StatCard
                label="Total Evaluated"
                value={data.passFailAnalytics.totalEvaluated}
              />
              <StatCard
                label="Average Score"
                value={formatPercent(data.passFailAnalytics.averageScore)}
              />
            </div>
          </>
        )}
      </Panel>

      <Panel subtitle="Recent exam outcomes." title="Pass / Fail By Exam">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Evaluated</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Pass Rate</th>
                <th>Average Score</th>
              </tr>
            </thead>
            <tbody>
              {data?.passFailByExam.map((exam) => (
                <tr key={exam.examId}>
                  <td>{exam.examTitle}</td>
                  <td>{exam.evaluatedCount}</td>
                  <td>{exam.passCount}</td>
                  <td>{exam.failCount}</td>
                  <td>{formatPercent(exam.passRate)}</td>
                  <td>{formatPercent(exam.averageScore)}</td>
                </tr>
              ))}
              {!data?.passFailByExam.length && (
                <tr>
                  <td colSpan={6}>No exam analytics available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
