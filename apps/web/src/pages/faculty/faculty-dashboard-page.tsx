import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { FacultyDashboardResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { StatCard } from '../../components/ui/stat-card';
import { ErrorMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatPercent } from '../../lib/format';

export function FacultyDashboardPage() {
  const [data, setData] = useState<FacultyDashboardResponse | null>(null);
  const task = useApiTask();

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    const response = await task.run(() =>
      apiRequest<FacultyDashboardResponse>(endpoints.faculty.dashboard)
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
        subtitle="Faculty performance and exam outcomes."
        title="Faculty Dashboard"
      >
        {task.error && <ErrorMessage message={task.error} />}
        {data && (
          <div className="stat-grid">
            <StatCard label="Total Exams" value={data.performanceStatistics.totalExams} />
            <StatCard
              label="Evaluated Attempts"
              value={data.performanceStatistics.evaluatedAttempts}
            />
            <StatCard
              label="Pass Rate"
              value={formatPercent(data.performanceStatistics.passRate)}
            />
            <StatCard
              label="Average Score"
              value={formatPercent(data.performanceStatistics.averageScore)}
            />
          </div>
        )}
      </Panel>

      <Panel subtitle="Exam-level score distribution." title="Exam Performance">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Evaluated</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Avg</th>
                <th>Highest</th>
                <th>Lowest</th>
              </tr>
            </thead>
            <tbody>
              {data?.examPerformance.map((exam) => (
                <tr key={exam.examId}>
                  <td>
                    {exam.examTitle}
                    <div className="tiny muted">ID: {exam.examId}</div>
                  </td>
                  <td>{exam.evaluatedAttempts}</td>
                  <td>{exam.passCount}</td>
                  <td>{exam.failCount}</td>
                  <td>{formatPercent(exam.averageScore)}</td>
                  <td>{formatPercent(exam.highestScore)}</td>
                  <td>{formatPercent(exam.lowestScore)}</td>
                </tr>
              ))}
              {!data?.examPerformance.length && (
                <tr>
                  <td colSpan={7}>No exam performance data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
