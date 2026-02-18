import { FormEvent, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime } from '../../lib/format';

type EnrollmentResponse = {
  enrollmentId: string;
  studentId: string;
  batchId: string;
  status: string;
  enrolledAt: string;
};

export function EnrollmentPage() {
  const [batchId, setBatchId] = useState('');
  const [enrollments, setEnrollments] = useState<EnrollmentResponse[]>([]);
  const task = useApiTask();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await task.run(
      () =>
        apiRequest<EnrollmentResponse>(endpoints.student.enrollments, {
          method: 'POST',
          body: { batchId: batchId.trim() }
        }),
      'Enrollment successful.'
    );
    if (!response) {
      return;
    }
    setEnrollments((previous) => [response, ...previous]);
    setBatchId('');
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Enroll into a batch by ID." title="New Enrollment">
        <form className="inline-form" onSubmit={onSubmit}>
          <input
            onChange={(event) => setBatchId(event.target.value)}
            placeholder="Enter batch ID"
            required
            value={batchId}
          />
          <button className="btn" disabled={task.loading} type="submit">
            {task.loading ? 'Enrolling...' : 'Enroll'}
          </button>
        </form>

        {task.error && <ErrorMessage message={task.error} />}
        {task.success && <SuccessMessage message={task.success} />}
      </Panel>

      <Panel subtitle="Enrollment records from this session." title="Recent Enrollments">
        <HintMessage message="Current API set does not provide list-all-available-batches for students." />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Enrollment ID</th>
                <th>Batch ID</th>
                <th>Status</th>
                <th>Enrolled At</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((row) => (
                <tr key={row.enrollmentId}>
                  <td>{row.enrollmentId}</td>
                  <td>{row.batchId}</td>
                  <td>{row.status}</td>
                  <td>{formatDateTime(row.enrolledAt)}</td>
                </tr>
              ))}
              {enrollments.length === 0 && (
                <tr>
                  <td colSpan={4}>No enrollment activity yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
