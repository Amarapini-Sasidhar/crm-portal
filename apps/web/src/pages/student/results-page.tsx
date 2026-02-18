import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { StudentResultRow } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage } from '../../components/ui/feedback';
import { EmptyState } from '../../components/ui/empty-state';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime, formatPercent } from '../../lib/format';

export function ResultsPage() {
  const [results, setResults] = useState<StudentResultRow[]>([]);
  const task = useApiTask();

  const sortedResults = useMemo(() => {
    return [...results].sort(
      (left, right) =>
        new Date(left.evaluatedAt).getTime() - new Date(right.evaluatedAt).getTime()
    );
  }, [results]);

  const scoreHistoryData = useMemo(() => {
    return sortedResults.map((row, index) => ({
      label: `${index + 1}`,
      examTitle: row.examTitle,
      scorePercentage: Number(row.scorePercentage.toFixed(2)),
      marksObtained: row.marksObtained,
      maxMarks: row.maxMarks
    }));
  }, [sortedResults]);

  const passFailData = useMemo(() => {
    const passCount = results.filter((row) => row.passed).length;
    const failCount = results.length - passCount;
    return [
      { name: 'Passed', value: passCount, fill: '#0d7a55' },
      { name: 'Failed', value: failCount, fill: '#bd2d2d' }
    ];
  }, [results]);

  const passCount = passFailData[0].value;
  const failCount = passFailData[1].value;
  const averageScore =
    results.length === 0
      ? 0
      : results.reduce((sum, row) => sum + row.scorePercentage, 0) / results.length;

  useEffect(() => {
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadResults() {
    const response = await task.run(() =>
      apiRequest<StudentResultRow[]>(endpoints.student.results)
    );
    if (response) {
      setResults(response);
    }
  }

  return (
    <div className="page-grid">
      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadResults()} type="button">
            {task.loading ? <LoadingSpinner label="Loading..." size="sm" /> : 'Refresh'}
          </button>
        }
        subtitle="Score history with pass/fail trend."
        title="My Results"
      >
        {task.error && <ErrorMessage message={task.error} />}
        {task.loading && <LoadingSpinner label="Loading score history..." />}
        <div className="stat-grid compact">
          <div className="stat-card">
            <p className="stat-label">Total Attempts Evaluated</p>
            <p className="stat-value">{results.length}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Average Score</p>
            <p className="stat-value">{formatPercent(averageScore)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Passed</p>
            <p className="stat-value">{passCount}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Failed</p>
            <p className="stat-value">{failCount}</p>
          </div>
        </div>
      </Panel>

      {!task.loading && results.length === 0 && (
        <Panel subtitle="No evaluated attempts yet." title="Empty Result Set">
          <EmptyState
            description="Attempt an exam and submit it to view your score history and analytics."
            title="No Results Available"
          />
        </Panel>
      )}

      {results.length > 0 && (
        <>
          <Panel subtitle="Score percentage progression by attempt order." title="Score History Chart">
            <div className="chart-wrap">
              <ResponsiveContainer height={300} width="100%">
                <LineChart data={scoreHistoryData}>
                  <CartesianGrid stroke="#d9e4ec" strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    formatter={(value) => `${value}%`}
                    labelFormatter={(label) => `Attempt ${label}`}
                  />
                  <Legend />
                  <Line
                    dataKey="scorePercentage"
                    name="Score %"
                    stroke="#0a6c7f"
                    strokeWidth={2}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel subtitle="Pass/fail split across all evaluated attempts." title="Pass-Fail Distribution">
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

          <Panel subtitle="Attempt-wise marks obtained vs max marks." title="Detailed Scores">
            <div className="chart-wrap">
              <ResponsiveContainer height={300} width="100%">
                <BarChart data={scoreHistoryData}>
                  <CartesianGrid stroke="#d9e4ec" strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="marksObtained" fill="#0a6c7f" name="Marks Obtained" />
                  <Bar dataKey="maxMarks" fill="#9cc7d1" name="Max Marks" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Score</th>
                    <th>Questions</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Unanswered</th>
                    <th>Status</th>
                    <th>Evaluated At</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.resultId}>
                      <td>{row.examTitle}</td>
                      <td>
                        {row.marksObtained}/{row.maxMarks} ({formatPercent(row.scorePercentage)})
                      </td>
                      <td>{row.totalQuestions}</td>
                      <td>{row.correctAnswers}</td>
                      <td>{row.wrongAnswers}</td>
                      <td>{row.unanswered}</td>
                      <td>{row.passed ? 'Passed' : 'Failed'}</td>
                      <td>{formatDateTime(row.evaluatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
