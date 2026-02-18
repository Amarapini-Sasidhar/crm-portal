import { FormEvent, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime } from '../../lib/format';

type CreatedCourse = {
  courseId: string;
  name: string;
  description: string | null;
  duration: number;
  courseCode: string;
  status: string;
  createdAt: string;
};

export function CourseManagementPage() {
  const [course, setCourse] = useState({
    name: '',
    description: '',
    duration: '30'
  });
  const [createdCourses, setCreatedCourses] = useState<CreatedCourse[]>([]);
  const [search, setSearch] = useState('');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    duration: '30'
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tableSuccess, setTableSuccess] = useState<string | null>(null);
  const task = useApiTask();

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return createdCourses;
    }
    return createdCourses.filter((item) => {
      return (
        item.courseCode.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
      );
    });
  }, [createdCourses, search]);

  async function onCreateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    task.clearMessages();
    setCreateError(null);
    setTableError(null);
    setTableSuccess(null);

    const normalizedName = course.name.trim();
    const duration = Number(course.duration);
    if (!normalizedName) {
      setCreateError('Course name is required.');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      setCreateError('Duration must be at least 1 day.');
      return;
    }

    const payload = {
      name: normalizedName,
      description: course.description.trim() || undefined,
      duration
    };

    const response = await task.run(
      () =>
        apiRequest<CreatedCourse>(endpoints.admin.courses, {
          method: 'POST',
          body: payload
        }),
      'Course created successfully.'
    );

    if (!response) {
      return;
    }

    setCreatedCourses((previous) => [response, ...previous]);
    setCourse({
      name: '',
      description: '',
      duration: '30'
    });
  }

  function startEdit(courseItem: CreatedCourse) {
    setTableError(null);
    setTableSuccess(null);
    setEditingCourseId(courseItem.courseId);
    setEditForm({
      name: courseItem.name,
      description: courseItem.description ?? '',
      duration: String(courseItem.duration)
    });
  }

  function cancelEdit() {
    setEditingCourseId(null);
    setEditForm({
      name: '',
      description: '',
      duration: '30'
    });
  }

  function saveEdit() {
    if (!editingCourseId) {
      return;
    }

    const normalizedName = editForm.name.trim();
    const duration = Number(editForm.duration);

    if (!normalizedName) {
      setTableError('Course name is required.');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      setTableError('Duration must be at least 1 day.');
      return;
    }

    setCreatedCourses((previous) =>
      previous.map((item) =>
        item.courseId === editingCourseId
          ? {
              ...item,
              name: normalizedName,
              description: editForm.description.trim() || null,
              duration
            }
          : item
      )
    );
    setTableError(null);
    setTableSuccess(
      'Course updated in UI session table. Current backend API set has no course update endpoint.'
    );
    cancelEdit();
  }

  function deleteCourse(courseId: string) {
    setCreatedCourses((previous) => previous.filter((item) => item.courseId !== courseId));
    setTableError(null);
    setTableSuccess(
      'Course removed from UI session table. Current backend API set has no course delete endpoint.'
    );
    if (editingCourseId === courseId) {
      cancelEdit();
    }
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Create course catalog entries." title="Create Course">
        <form className="stack-form" onSubmit={onCreateCourse}>
          <label className="field">
            <span>Course name</span>
            <input
              onChange={(event) => setCourse({ ...course, name: event.target.value })}
              required
              value={course.name}
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              onChange={(event) => setCourse({ ...course, description: event.target.value })}
              rows={4}
              value={course.description}
            />
          </label>

          <label className="field">
            <span>Duration (days)</span>
            <input
              min={1}
              onChange={(event) => setCourse({ ...course, duration: event.target.value })}
              required
              type="number"
              value={course.duration}
            />
          </label>

          {createError && <ErrorMessage message={createError} />}
          {task.error && <ErrorMessage message={task.error} />}
          {task.success && <SuccessMessage message={task.success} />}

          <button className="btn" disabled={task.loading} type="submit">
            {task.loading ? 'Creating...' : 'Create Course'}
          </button>
        </form>
      </Panel>

      <Panel
        subtitle="Search and manage course rows captured by this UI session."
        title="Course Records"
      >
        <HintMessage message="Current API set provides course create only (`POST /admin/courses`). List/edit/delete are UI-session actions." />
        <label className="field">
          <span>Search by code, name, or status</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type to search courses"
            value={search}
          />
        </label>
        {tableError && <ErrorMessage message={tableError} />}
        {tableSuccess && <SuccessMessage message={tableSuccess} />}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((item) => {
                const isEditing = editingCourseId === item.courseId;
                return (
                  <tr key={item.courseId}>
                    <td>{item.courseCode}</td>
                    <td>
                      {isEditing ? (
                        <input
                          onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                          value={editForm.name}
                        />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          onChange={(event) =>
                            setEditForm({ ...editForm, description: event.target.value })
                          }
                          value={editForm.description}
                        />
                      ) : (
                        item.description ?? '-'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          min={1}
                          onChange={(event) =>
                            setEditForm({ ...editForm, duration: event.target.value })
                          }
                          type="number"
                          value={editForm.duration}
                        />
                      ) : (
                        `${item.duration} days`
                      )}
                    </td>
                    <td>{item.status}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <div className="actions-cell">
                        {isEditing ? (
                          <>
                            <button className="btn" onClick={saveEdit} type="button">
                              Save
                            </button>
                            <button className="btn btn-outline" onClick={cancelEdit} type="button">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-outline"
                              onClick={() => startEdit(item)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-outline danger-on-hover"
                              onClick={() => deleteCourse(item.courseId)}
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
              {filteredCourses.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    {createdCourses.length === 0
                      ? 'No courses created in this session.'
                      : 'No course matches your search.'}
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
