import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { AdminDashboardResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage } from '../../components/ui/feedback';
import { EmptyState } from '../../components/ui/empty-state';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { useApiTask } from '../../hooks/use-api-task';
import { formatPercent } from '../../lib/format';

export function AdminReportsPage() {
  const [analytics, setAnalytics] = useState<AdminDashboardResponse | null>(null);
  const task = useApiTask();

  const totalsData = useMemo(() => {
    if (!analytics) {
      return [];
    }
    return [
      { name: 'Students', value: analytics.totals.totalStudents },
      { name: 'Courses', value: analytics.totals.totalCourses },
      { name: 'Exams', value: analytics.totals.totalExams }
    ];
  }, [analytics]);

  const passFailData = useMemo(() => {
    if (!analytics) {
      return [
        { name: 'Passed', value: 0, fill: '#0d7a55' },
        { name: 'Failed', value: 0, fill: '#bd2d2d' }
      ];
    }
    return [
      {
        name: 'Passed',
        value: analytics.passFailAnalytics.passCount,
        fill: '#0d7a55'
      },
      {
        name: 'Failed',
        value: analytics.passFailAnalytics.failCount,
        fill: '#bd2d2d'
      }
    ];
  }, [analytics]);

  const byExamData = useMemo(() => {
    if (!analytics) {
      return [];
    }
    return analytics.passFailByExam.map((row, index) => ({
      label: `${index + 1}`,
      examTitle: row.examTitle,
      passRate: Number(row.passRate.toFixed(2)),
      averageScore: Number(row.averageScore.toFixed(2)),
      passCount: row.passCount,
      failCount: row.failCount
    }));
  }, [analytics]);

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReports() {
    const response = await task.run(() =>
      apiRequest<AdminDashboardResponse>(endpoints.admin.dashboard)
    );
    if (response) {
      setAnalytics(response);
    }
  }

  return (
    <div className="page-grid">
      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadReports()} type="button">
            {task.loading ? <LoadingSpinner label="Loading..." size="sm" /> : 'Refresh'}
          </button>
        }
        subtitle="Overall analytics across students, courses, exams, and outcomes."
        title="Reports & Analytics"
      >
        {task.error && <ErrorMessage message={task.error} />}
        {task.loading && <LoadingSpinner label="Loading analytics..." />}
        <div className="stat-grid compact">
          <div className="stat-card">
            <p className="stat-label">Total Evaluated</p>
            <p className="stat-value">{analytics?.passFailAnalytics.totalEvaluated ?? 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Overall Pass Rate</p>
            <p className="stat-value">
              {formatPercent(analytics?.passFailAnalytics.passRate ?? 0)}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Average Score</p>
            <p className="stat-value">
              {formatPercent(analytics?.passFailAnalytics.averageScore ?? 0)}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Tracked Exams</p>
            <p className="stat-value">{analytics?.passFailByExam.length ?? 0}</p>
          </div>
        </div>
      </Panel>

      {!task.loading && !analytics && (
        <Panel subtitle="No analytics payload returned yet." title="No Data">
          <EmptyState
            description="Refresh reports after exam attempts are evaluated."
            title="Analytics Unavailable"
          />
        </Panel>
      )}

      {analytics && (
        <>
          <Panel subtitle="Students, courses, and exams count." title="Entity Totals">
            <div className="chart-wrap">
              <ResponsiveContainer height={300} width="100%">
                <BarChart data={totalsData}>
                  <CartesianGrid stroke="#d9e4ec" strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#0a6c7f" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel subtitle="Global pass/fail outcome split." title="Outcome Distribution">
            <div className="chart-wrap">
              <ResponsiveContainer height={300} width="100%">
                <PieChart>
                  <Pie
                    cx="50%"
                    cy="50%"
                    data={passFailData}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={90}
                  >
                    {passFailData.map((entry) => (
                      <Cell fill={entry.fill} key={entry.name} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel subtitle="Per-exam pass rate and average score." title="Exam Analytics">
            <div className="chart-wrap">
              <ResponsiveContainer height={340} width="100%">
                <BarChart data={byExamData}>
                  <CartesianGrid stroke="#d9e4ec" strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    formatter={(value) => `${value}%`}
                    labelFormatter={(label) => `Exam #${label}`}
                  />
                  <Legend />
                  <Bar dataKey="passRate" fill="#0d7a55" name="Pass Rate %" />
                  <Bar dataKey="averageScore" fill="#0a6c7f" name="Average Score %" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Pass Rate</th>
                    <th>Average Score</th>
                    <th>Pass Count</th>
                    <th>Fail Count</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.passFailByExam.map((row) => (
                    <tr key={row.examId}>
                      <td>{row.examTitle}</td>
                      <td>{formatPercent(row.passRate)}</td>
                      <td>{formatPercent(row.averageScore)}</td>
                      <td>{row.passCount}</td>
                      <td>{row.failCount}</td>
                    </tr>
                  ))}
                  {!analytics.passFailByExam.length && (
                    <tr>
                      <td colSpan={5}>No exam analytics available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
