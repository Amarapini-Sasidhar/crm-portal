import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { PublicUser, UserStatus } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime } from '../../lib/format';

const statusOptions: UserStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

export function AdminManagementPage() {
  const [admins, setAdmins] = useState<PublicUser[]>([]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: ''
  });
  const listTask = useApiTask();
  const createTask = useApiTask();
  const statusTask = useApiTask();

  useEffect(() => {
    void loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAdmins() {
    const response = await listTask.run(() =>
      apiRequest<PublicUser[]>(endpoints.superAdmin.admins)
    );
    if (response) {
      setAdmins(response);
    }
  }

  async function onCreateAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...form,
      phone: form.phone || undefined
    };

    const created = await createTask.run(
      () =>
        apiRequest<PublicUser>(endpoints.superAdmin.admins, {
          method: 'POST',
          body: payload
        }),
      'Admin created successfully.'
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
    await loadAdmins();
  }

  async function onUpdateStatus(userId: string, status: UserStatus) {
    const updated = await statusTask.run(
      () =>
        apiRequest<PublicUser>(endpoints.superAdmin.adminStatus(userId), {
          method: 'PATCH',
          body: { status }
        }),
      'Admin status updated.'
    );

    if (!updated) {
      return;
    }

    setAdmins((previous) => previous.map((item) => (item.userId === userId ? updated : item)));
  }

  return (
    <div className="page-grid">
      <Panel
        subtitle="Create and control admin accounts."
        title="Admin Management"
      >
        <form className="stack-form" onSubmit={onCreateAdmin}>
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

          {createTask.error && <ErrorMessage message={createTask.error} />}
          {createTask.success && <SuccessMessage message={createTask.success} />}

          <button className="btn" disabled={createTask.loading} type="submit">
            {createTask.loading ? 'Creating...' : 'Create Admin'}
          </button>
        </form>
      </Panel>

      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadAdmins()} type="button">
            Refresh
          </button>
        }
        subtitle="List of existing admin users."
        title="Admins"
      >
        {listTask.error && <ErrorMessage message={listTask.error} />}
        {statusTask.error && <ErrorMessage message={statusTask.error} />}
        {statusTask.success && <SuccessMessage message={statusTask.success} />}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.userId}>
                  <td>
                    {admin.firstName} {admin.lastName}
                  </td>
                  <td>{admin.email}</td>
                  <td>
                    <select
                      onChange={(event) =>
                        void onUpdateStatus(admin.userId, event.target.value as UserStatus)
                      }
                      value={admin.status}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatDateTime(admin.createdAt)}</td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={4}>No admins found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
