import { FormEvent, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDate } from '../../lib/format';

type BatchResponse = {
  batchId: string;
  courseId: string;
  facultyId: string | null;
  startDate: string;
  endDate: string;
  status: string;
  capacity: number;
  batchCode: string;
  batchName: string;
  createdAt: string;
};

export function BatchManagementPage() {
  const [createPayload, setCreatePayload] = useState({
    courseId: '',
    facultyId: '',
    startDate: '',
    endDate: '',
    capacity: '100'
  });
  const [assignPayload, setAssignPayload] = useState({
    batchId: '',
    facultyId: ''
  });
  const [batches, setBatches] = useState<BatchResponse[]>([]);
  const [search, setSearch] = useState('');
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    startDate: '',
    endDate: '',
    capacity: '100',
    facultyId: ''
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tableSuccess, setTableSuccess] = useState<string | null>(null);

  const createTask = useApiTask();
  const assignTask = useApiTask();
  const editTask = useApiTask();
  const filteredBatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return batches;
    }
    return batches.filter((batch) => {
      return (
        batch.batchCode.toLowerCase().includes(query) ||
        batch.batchName.toLowerCase().includes(query) ||
        batch.courseId.toLowerCase().includes(query) ||
        (batch.facultyId ?? '').toLowerCase().includes(query) ||
        batch.status.toLowerCase().includes(query)
      );
    });
  }, [batches, search]);

  async function onCreateBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createTask.clearMessages();
    setCreateError(null);
    setTableError(null);
    setTableSuccess(null);

    const startDate = createPayload.startDate;
    const endDate = createPayload.endDate;
    const capacity = Number(createPayload.capacity);
    if (!createPayload.courseId.trim() || !createPayload.facultyId.trim()) {
      setCreateError('Course ID and Faculty ID are required.');
      return;
    }
    if (!startDate || !endDate) {
      setCreateError('Start date and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setCreateError('End date must be after or equal to start date.');
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      setCreateError('Capacity must be at least 1.');
      return;
    }

    const response = await createTask.run(
      () =>
        apiRequest<BatchResponse>(endpoints.admin.batches, {
          method: 'POST',
          body: {
            courseId: createPayload.courseId.trim(),
            facultyId: createPayload.facultyId.trim(),
            startDate,
            endDate,
            capacity
          }
        }),
      'Batch created and faculty assigned.'
    );

    if (!response) {
      return;
    }

    setBatches((previous) => [response, ...previous]);
    setCreatePayload({
      courseId: '',
      facultyId: '',
      startDate: '',
      endDate: '',
      capacity: '100'
    });
  }

  async function onAssignFaculty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assignTask.clearMessages();
    setAssignError(null);
    setTableError(null);
    setTableSuccess(null);
    if (!assignPayload.batchId.trim() || !assignPayload.facultyId.trim()) {
      setAssignError('Batch ID and Faculty ID are required.');
      return;
    }

    const response = await assignTask.run(
      () =>
        apiRequest<BatchResponse>(endpoints.admin.batchFaculty(assignPayload.batchId.trim()), {
          method: 'PATCH',
          body: {
            facultyId: assignPayload.facultyId.trim()
          }
        }),
      'Faculty assigned to batch.'
    );

    if (!response) {
      return;
    }

    setBatches((previous) => {
      const hasExisting = previous.some((item) => item.batchId === response.batchId);
      if (!hasExisting) {
        return [response, ...previous];
      }
      return previous.map((item) => (item.batchId === response.batchId ? response : item));
    });

    setAssignPayload({
      batchId: '',
      facultyId: ''
    });
  }

  function startEdit(batch: BatchResponse) {
    setTableError(null);
    setTableSuccess(null);
    editTask.clearMessages();
    setEditingBatchId(batch.batchId);
    setEditForm({
      startDate: batch.startDate,
      endDate: batch.endDate,
      capacity: String(batch.capacity),
      facultyId: batch.facultyId ?? ''
    });
  }

  function cancelEdit() {
    setEditingBatchId(null);
    setEditForm({
      startDate: '',
      endDate: '',
      capacity: '100',
      facultyId: ''
    });
  }

  async function saveEdit(batch: BatchResponse) {
    if (!editingBatchId) {
      return;
    }

    const startDate = editForm.startDate;
    const endDate = editForm.endDate;
    const capacity = Number(editForm.capacity);
    const facultyId = editForm.facultyId.trim();

    if (!startDate || !endDate) {
      setTableError('Start date and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setTableError('End date must be after or equal to start date.');
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      setTableError('Capacity must be at least 1.');
      return;
    }
    if (!facultyId) {
      setTableError('Faculty ID is required.');
      return;
    }

    let persistedBatch = batch;
    if (facultyId !== (batch.facultyId ?? '')) {
      const reassigned = await editTask.run(
        () =>
          apiRequest<BatchResponse>(endpoints.admin.batchFaculty(batch.batchId), {
            method: 'PATCH',
            body: {
              facultyId
            }
          }),
        'Batch faculty assignment updated.'
      );
      if (!reassigned) {
        return;
      }
      persistedBatch = reassigned;
    }

    setBatches((previous) =>
      previous.map((item) =>
        item.batchId === batch.batchId
          ? {
              ...item,
              ...persistedBatch,
              startDate,
              endDate,
              capacity
            }
          : item
      )
    );
    setTableError(null);
    setTableSuccess(
      'Batch row updated. Persisted field: faculty assignment. Schedule/capacity edits are tracked in UI because batch update API is not exposed.'
    );
    cancelEdit();
  }

  function deleteBatch(batchId: string) {
    setBatches((previous) => previous.filter((item) => item.batchId !== batchId));
    setTableError(null);
    setTableSuccess(
      'Batch removed from UI session table. Current backend API set has no batch delete endpoint.'
    );
    if (editingBatchId === batchId) {
      cancelEdit();
    }
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Create a batch and assign faculty immediately." title="Create Batch">
        <form className="stack-form" onSubmit={onCreateBatch}>
          <div className="field-grid two">
            <label className="field">
              <span>Course ID</span>
              <input
                onChange={(event) => setCreatePayload({ ...createPayload, courseId: event.target.value })}
                required
                value={createPayload.courseId}
              />
            </label>
            <label className="field">
              <span>Faculty ID</span>
              <input
                onChange={(event) => setCreatePayload({ ...createPayload, facultyId: event.target.value })}
                required
                value={createPayload.facultyId}
              />
            </label>
          </div>

          <div className="field-grid three">
            <label className="field">
              <span>Start date</span>
              <input
                onChange={(event) => setCreatePayload({ ...createPayload, startDate: event.target.value })}
                required
                type="date"
                value={createPayload.startDate}
              />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                onChange={(event) => setCreatePayload({ ...createPayload, endDate: event.target.value })}
                required
                type="date"
                value={createPayload.endDate}
              />
            </label>
            <label className="field">
              <span>Capacity</span>
              <input
                min={1}
                onChange={(event) => setCreatePayload({ ...createPayload, capacity: event.target.value })}
                required
                type="number"
                value={createPayload.capacity}
              />
            </label>
          </div>

          {createError && <ErrorMessage message={createError} />}
          {createTask.error && <ErrorMessage message={createTask.error} />}
          {createTask.success && <SuccessMessage message={createTask.success} />}

          <button className="btn" disabled={createTask.loading} type="submit">
            {createTask.loading ? 'Creating...' : 'Create Batch'}
          </button>
        </form>
      </Panel>

      <Panel subtitle="Reassign faculty for an existing batch." title="Assign Faculty">
        <form className="stack-form" onSubmit={onAssignFaculty}>
          <div className="field-grid two">
            <label className="field">
              <span>Batch ID</span>
              <input
                list="batch-id-options"
                onChange={(event) => setAssignPayload({ ...assignPayload, batchId: event.target.value })}
                required
                value={assignPayload.batchId}
              />
            </label>
            <label className="field">
              <span>Faculty ID</span>
              <input
                onChange={(event) => setAssignPayload({ ...assignPayload, facultyId: event.target.value })}
                required
                value={assignPayload.facultyId}
              />
            </label>
          </div>
          <datalist id="batch-id-options">
            {batches.map((batch) => (
              <option key={batch.batchId} value={batch.batchId} />
            ))}
          </datalist>

          {assignError && <ErrorMessage message={assignError} />}
          {assignTask.error && <ErrorMessage message={assignTask.error} />}
          {assignTask.success && <SuccessMessage message={assignTask.success} />}

          <button className="btn" disabled={assignTask.loading} type="submit">
            {assignTask.loading ? 'Assigning...' : 'Assign Faculty'}
          </button>
        </form>
      </Panel>

      <Panel subtitle="Search, edit, and manage batch rows captured in this UI session." title="Batch Records">
        <HintMessage message="Current API set has create and faculty assignment endpoints only. No list/update/delete batch endpoint is exposed." />
        <label className="field">
          <span>Search by batch code/name, course ID, faculty ID, or status</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type to search batches"
            value={search}
          />
        </label>
        {tableError && <ErrorMessage message={tableError} />}
        {tableSuccess && <SuccessMessage message={tableSuccess} />}
        {editTask.error && <ErrorMessage message={editTask.error} />}
        {editTask.success && <SuccessMessage message={editTask.success} />}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Course ID</th>
                <th>Faculty ID</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Capacity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch) => {
                const isEditing = editingBatchId === batch.batchId;
                return (
                  <tr key={batch.batchId}>
                    <td>
                      {batch.batchName}
                      <div className="tiny muted">{batch.batchCode}</div>
                    </td>
                    <td>{batch.courseId}</td>
                    <td>
                      {isEditing ? (
                        <input
                          onChange={(event) => setEditForm({ ...editForm, facultyId: event.target.value })}
                          value={editForm.facultyId}
                        />
                      ) : (
                        batch.facultyId ?? '-'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="inline-actions">
                          <input
                            onChange={(event) => setEditForm({ ...editForm, startDate: event.target.value })}
                            type="date"
                            value={editForm.startDate}
                          />
                          <input
                            onChange={(event) => setEditForm({ ...editForm, endDate: event.target.value })}
                            type="date"
                            value={editForm.endDate}
                          />
                        </div>
                      ) : (
                        `${formatDate(batch.startDate)} - ${formatDate(batch.endDate)}`
                      )}
                    </td>
                    <td>{batch.status}</td>
                    <td>
                      {isEditing ? (
                        <input
                          min={1}
                          onChange={(event) => setEditForm({ ...editForm, capacity: event.target.value })}
                          type="number"
                          value={editForm.capacity}
                        />
                      ) : (
                        batch.capacity
                      )}
                    </td>
                    <td>
                      <div className="actions-cell">
                        {isEditing ? (
                          <>
                            <button
                              className="btn"
                              disabled={editTask.loading}
                              onClick={() => void saveEdit(batch)}
                              type="button"
                            >
                              {editTask.loading ? 'Saving...' : 'Save'}
                            </button>
                            <button className="btn btn-outline" onClick={cancelEdit} type="button">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-outline"
                              onClick={() => startEdit(batch)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-outline danger-on-hover"
                              onClick={() => deleteBatch(batch.batchId)}
                              type="button"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredBatches.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    {batches.length === 0
                      ? 'No batches created/updated in this session.'
                      : 'No batch matches your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
