import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { AuthResponse, PublicUser, UserStatus } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime } from '../../lib/format';

const statusOptions: UserStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

type EnrollmentResponse = {
  enrollmentId: string;
  studentId: string;
  batchId: string;
  status: string;
  enrolledAt: string;
};

export function StudentManagementPage() {
  const [students, setStudents] = useState<PublicUser[]>([]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: ''
  });
  const [pendingStatus, setPendingStatus] = useState<Record<string, UserStatus>>({});
  const [search, setSearch] = useState('');
  const [enrollmentForm, setEnrollmentForm] = useState({
    studentEmail: '',
    studentPassword: '',
    batchId: ''
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [recentEnrollments, setRecentEnrollments] = useState<EnrollmentResponse[]>([]);

  const listTask = useApiTask();
  const createTask = useApiTask();
  const statusTask = useApiTask();
  const studentAuthTask = useApiTask();
  const enrollTask = useApiTask();
  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return students;
    }
    return students.filter((student) => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      return (
        fullName.includes(query) ||
        student.email.toLowerCase().includes(query) ||
        student.status.toLowerCase().includes(query)
      );
    });
  }, [students, search]);

  useEffect(() => {
    void loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStudents() {
    const response = await listTask.run(() =>
      apiRequest<PublicUser[]>(endpoints.admin.students)
    );
    if (response) {
      setStudents(response);
    }
  }

  async function onCreateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createTask.clearMessages();
    setCreateError(null);
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    const password = form.password;

    if (!firstName || !lastName || !email || !password) {
      setCreateError('First name, last name, email, and password are required.');
      return;
    }

    const created = await createTask.run(
      () =>
        apiRequest<PublicUser>(endpoints.admin.students, {
          method: 'POST',
          body: {
            firstName,
            lastName,
            email,
            password,
            phone: form.phone.trim() || undefined
          }
        }),
      'Student account created.'
    );

    if (!created) {
      return;
    }

    setForm({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: ''
    });

    setStudents((previous) => [created, ...previous]);
    setPendingStatus((previous) => ({
      ...previous,
      [created.userId]: created.status
    }));
  }

  async function onUpdateStatus(
    userId: string,
    status: UserStatus,
    successMessage = 'Student status updated.'
  ) {
    const updated = await statusTask.run(
      () =>
        apiRequest<PublicUser>(endpoints.admin.studentStatus(userId), {
          method: 'PATCH',
          body: { status }
        }),
      successMessage
    );
    if (!updated) {
      return;
    }
    setStudents((previous) => previous.map((item) => (item.userId === userId ? updated : item)));
    setPendingStatus((previous) => ({
      ...previous,
      [updated.userId]: updated.status
    }));
  }

  async function onSoftDeleteStudent(userId: string) {
    await onUpdateStatus(userId, 'SUSPENDED', 'Student suspended (soft delete).');
  }

  async function onEnrollStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnrollmentError(null);
    studentAuthTask.clearMessages();
    enrollTask.clearMessages();

    const email = enrollmentForm.studentEmail.trim();
    const password = enrollmentForm.studentPassword;
    const batchId = enrollmentForm.batchId.trim();

    if (!email || !password || !batchId) {
      setEnrollmentError('Student email, password, and batch ID are required.');
      return;
    }

    const loginResponse = await studentAuthTask.run(
      () =>
        apiRequest<AuthResponse>(endpoints.auth.login, {
          method: 'POST',
          body: {
            email,
            password
          },
          authToken: null
        }),
      'Student credentials verified.'
    );
    if (!loginResponse) {
      return;
    }

    if (loginResponse.user.role !== 'STUDENT') {
      setEnrollmentError('Provided credentials do not belong to a student account.');
      return;
    }

    const enrollment = await enrollTask.run(
      () =>
        apiRequest<EnrollmentResponse>(endpoints.student.enrollments, {
          method: 'POST',
          body: {
            batchId
          },
          authToken: loginResponse.accessToken
        }),
      'Student enrolled successfully.'
    );
    if (!enrollment) {
      return;
    }

    setRecentEnrollments((previous) => [enrollment, ...previous]);
    setEnrollmentForm({
      studentEmail: '',
      studentPassword: '',
      batchId: ''
    });
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Create student accounts managed by Admin." title="Create Student">
        <form className="stack-form" onSubmit={onCreateStudent}>
          <div className="field-grid two">
            <label className="field">
              <span>First name</span>
              <input
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
                value={form.firstName}
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
                value={form.lastName}
              />
            </label>
          </div>

          <label className="field">
            <span>Email</span>
            <input
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              type="email"
              value={form.email}
            />
          </label>

          <div className="field-grid two">
            <label className="field">
              <span>Password</span>
              <input
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
                type="password"
                value={form.password}
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                value={form.phone}
              />
            </label>
          </div>

          {createError && <ErrorMessage message={createError} />}
          {createTask.error && <ErrorMessage message={createTask.error} />}
          {createTask.success && <SuccessMessage message={createTask.success} />}

          <button className="btn" disabled={createTask.loading} type="submit">
            {createTask.loading ? 'Creating...' : 'Create Student'}
          </button>
        </form>
      </Panel>

      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadStudents()} type="button">
            Refresh
          </button>
        }
        subtitle="Students with search, edit (status), and delete (soft-delete via suspend)."
        title="Students"
      >
        {listTask.error && <ErrorMessage message={listTask.error} />}
        {statusTask.error && <ErrorMessage message={statusTask.error} />}
        {statusTask.success && <SuccessMessage message={statusTask.success} />}
        <label className="field">
          <span>Search by name, email, or status</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type to search students"
            value={search}
          />
        </label>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.userId}>
                  <td>
                    {student.firstName} {student.lastName}
                  </td>
                  <td>{student.email}</td>
                  <td>
                    <select
                      onChange={(event) =>
                        setPendingStatus((previous) => ({
                          ...previous,
                          [student.userId]: event.target.value as UserStatus
                        }))
                      }
                      value={pendingStatus[student.userId] ?? student.status}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatDateTime(student.createdAt)}</td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="btn btn-outline"
                        disabled={statusTask.loading}
                        onClick={() =>
                          void onUpdateStatus(
                            student.userId,
                            pendingStatus[student.userId] ?? student.status
                          )
                        }
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-outline danger-on-hover"
                        disabled={statusTask.loading}
                        onClick={() => void onSoftDeleteStudent(student.userId)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    {students.length === 0 ? 'No students available.' : 'No student matches your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel subtitle="Enroll a student into a batch using existing backend APIs only." title="Enroll Student">
        <HintMessage message="Flow: Admin enters student credentials -> system calls `/auth/login` -> system calls `/student/enrollments` with that student JWT." />
        <form className="stack-form" onSubmit={onEnrollStudent}>
          <div className="field-grid two">
            <label className="field">
              <span>Student email</span>
              <input
                onChange={(event) =>
                  setEnrollmentForm({ ...enrollmentForm, studentEmail: event.target.value })
                }
                required
                type="email"
                value={enrollmentForm.studentEmail}
              />
            </label>
            <label className="field">
              <span>Student password</span>
              <input
                onChange={(event) =>
                  setEnrollmentForm({ ...enrollmentForm, studentPassword: event.target.value })
                }
                required
                type="password"
                value={enrollmentForm.studentPassword}
              />
            </label>
          </div>

          <label className="field">
            <span>Batch ID</span>
            <input
              onChange={(event) => setEnrollmentForm({ ...enrollmentForm, batchId: event.target.value })}
              placeholder="Enter target batch ID"
              required
              value={enrollmentForm.batchId}
            />
          </label>

          {enrollmentError && <ErrorMessage message={enrollmentError} />}
          {studentAuthTask.error && <ErrorMessage message={studentAuthTask.error} />}
          {studentAuthTask.success && <SuccessMessage message={studentAuthTask.success} />}
          {enrollTask.error && <ErrorMessage message={enrollTask.error} />}
          {enrollTask.success && <SuccessMessage message={enrollTask.success} />}

          <button
            className="btn"
            disabled={studentAuthTask.loading || enrollTask.loading}
            type="submit"
          >
            {studentAuthTask.loading || enrollTask.loading ? 'Enrolling...' : 'Enroll Student'}
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Enrollment ID</th>
                <th>Student ID</th>
                <th>Batch ID</th>
                <th>Status</th>
                <th>Enrolled At</th>
              </tr>
            </thead>
            <tbody>
              {recentEnrollments.map((row) => (
                <tr key={row.enrollmentId}>
                  <td>{row.enrollmentId}</td>
                  <td>{row.studentId}</td>
                  <td>{row.batchId}</td>
                  <td>{row.status}</td>
                  <td>{formatDateTime(row.enrolledAt)}</td>
                </tr>
              ))}
              {recentEnrollments.length === 0 && (
                <tr>
                  <td colSpan={5}>No enrollments submitted from this admin session yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
