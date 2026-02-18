import { FormEvent, useMemo, useState } from 'react';
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
import type { FacultyExamScoresResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage } from '../../components/ui/feedback';
import { EmptyState } from '../../components/ui/empty-state';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime, formatPercent } from '../../lib/format';

export function ExamScoresPage() {
  const [examId, setExamId] = useState('');
  const [data, setData] = useState<FacultyExamScoresResponse | null>(null);
  const task = useApiTask();

  const chartData = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.studentScores.map((row, index) => ({
      label: `${index + 1}`,
      studentName: row.name,
      scorePercentage: Number(row.scorePercentage.toFixed(2)),
      marksObtained: row.marksObtained,
      maxMarks: row.maxMarks
    }));
  }, [data]);

  const passFailData = useMemo(() => {
    if (!data) {
      return [
        { name: 'Passed', value: 0, fill: '#0d7a55' },
        { name: 'Failed', value: 0, fill: '#bd2d2d' }
      ];
    }
    const passCount = data.studentScores.filter((row) => row.passed).length;
    const failCount = data.studentScores.length - passCount;
    return [
      { name: 'Passed', value: passCount, fill: '#0d7a55' },
      { name: 'Failed', value: failCount, fill: '#bd2d2d' }
    ];
  }, [data]);

  const averageScore = useMemo(() => {
    if (!data || data.studentScores.length === 0) {
      return 0;
    }
    const total = data.studentScores.reduce((sum, row) => sum + row.scorePercentage, 0);
    return total / data.studentScores.length;
  }, [data]);

  const highestScore = useMemo(() => {
    if (!data || data.studentScores.length === 0) {
      return 0;
    }
    return Math.max(...data.studentScores.map((row) => row.scorePercentage));
  }, [data]);

  const lowestScore = useMemo(() => {
    if (!data || data.studentScores.length === 0) {
      return 0;
    }
    return Math.min(...data.studentScores.map((row) => row.scorePercentage));
  }, [data]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!examId.trim()) {
      return;
    }

    const response = await task.run(() =>
      apiRequest<FacultyExamScoresResponse>(endpoints.faculty.examScores(examId.trim()))
    );
    if (response) {
      setData(response);
    }
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Load student scores for a specific exam." title="Exam Scores">
        <form className="inline-form" onSubmit={onSubmit}>
          <input
            onChange={(event) => setExamId(event.target.value)}
            placeholder="Enter exam ID"
            required
            value={examId}
          />
          <button className="btn" disabled={task.loading} type="submit">
            {task.loading ? <LoadingSpinner label="Loading..." size="sm" /> : 'Get Scores'}
          </button>
        </form>
        {task.error && <ErrorMessage message={task.error} />}
        {task.loading && <LoadingSpinner label="Fetching exam performance..." />}
      </Panel>

      <Panel subtitle={data ? `Exam: ${data.examTitle}` : 'No exam loaded yet.'} title="Performance Overview">
        <div className="stat-grid compact">
          <div className="stat-card">
            <p className="stat-label">Students Evaluated</p>
            <p className="stat-value">{data?.studentScores.length ?? 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Average Score</p>
            <p className="stat-value">{formatPercent(averageScore)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Highest Score</p>
            <p className="stat-value">{formatPercent(highestScore)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Lowest Score</p>
            <p className="stat-value">{formatPercent(lowestScore)}</p>
          </div>
        </div>
      </Panel>

      {!task.loading && data && data.studentScores.length === 0 && (
        <Panel subtitle={`Exam: ${data.examTitle}`} title="No Student Scores">
          <EmptyState
            description="No evaluated attempts are available for this exam yet."
            title="No Performance Data"
          />
        </Panel>
      )}

      {data && data.studentScores.length > 0 && (
        <>
          <Panel subtitle="Per-student score percentages for this exam." title="Score Distribution">
            <div className="chart-wrap">
              <ResponsiveContainer height={320} width="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#d9e4ec" strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    formatter={(value) => `${value}%`}
                    labelFormatter={(label) => `Student #${label}`}
                  />
                  <Legend />
                  <Bar dataKey="scorePercentage" fill="#0a6c7f" name="Score %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel subtitle="Pass vs fail count for selected exam." title="Pass-Fail Split">
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
        </>
      )}

      <Panel subtitle={data ? `Exam: ${data.examTitle}` : 'Score list'} title="Student Scores">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Attempt</th>
                <th>Marks</th>
                <th>Score</th>
                <th>Passed</th>
                <th>Evaluated At</th>
              </tr>
            </thead>
            <tbody>
              {data?.studentScores.map((row) => (
                <tr key={`${row.studentId}-${row.attemptNo}`}>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td>#{row.attemptNo}</td>
                  <td>
                    {row.marksObtained}/{row.maxMarks}
                  </td>
                  <td>{formatPercent(row.scorePercentage)}</td>
                  <td>{row.passed ? 'Yes' : 'No'}</td>
                  <td>{formatDateTime(row.evaluatedAt)}</td>
                </tr>
              ))}
              {!data?.studentScores.length && (
                <tr>
                  <td colSpan={7}>No student scores loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export { ExamScoresPage as FacultyExamScoresPage };
