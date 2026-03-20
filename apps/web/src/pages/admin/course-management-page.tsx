import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
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

const featuredVideoUrl = 'https://youtu.be/bTPO0qnIoTs?si=jvyfocgztOi78Pp8';
const featuredCourseTitle = 'AI Launchpad';

function buildDescription(description: string, videoUrl: string): string | undefined {
  const normalizedDescription = description.trim();
  const normalizedVideoUrl = videoUrl.trim();

  if (!normalizedVideoUrl) {
    return normalizedDescription || undefined;
  }

  return normalizedDescription
    ? `${normalizedDescription}\n\n[VIDEO_URL]${normalizedVideoUrl}`
    : `[VIDEO_URL]${normalizedVideoUrl}`;
}

export function CourseManagementPage() {
  const { user } = useAuth();
  const [course, setCourse] = useState({
    name: '',
    description: '',
    duration: '30',
    videoUrl: ''
  });
  const [createdCourses, setCreatedCourses] = useState<CreatedCourse[]>([]);
  const [search, setSearch] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const courseTask = useApiTask();
  const createTask = useApiTask();

  const courseEndpoint =
    user?.role === 'SUPER_ADMIN' ? endpoints.superAdmin.courses : endpoints.admin.courses;

  useEffect(() => {
    void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseEndpoint]);

  async function loadCourses() {
    const response = await courseTask.run(() => apiRequest<CreatedCourse[]>(courseEndpoint));
    if (response) {
      setCreatedCourses(response);
    }
  }

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
    createTask.clearMessages();
    setCreateError(null);

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
      description: buildDescription(course.description, course.videoUrl),
      duration
    };

    const response = await createTask.run(
      () =>
        apiRequest<CreatedCourse>(courseEndpoint, {
          method: 'POST',
          body: payload
        }),
      'Course created successfully and added to the shared catalog.'
    );

    if (!response) {
      return;
    }

    setCourse({
      name: '',
      description: '',
      duration: '30',
      videoUrl: ''
    });

    setCreatedCourses((previous) => {
      const next = [response, ...previous.filter((item) => item.courseId !== response.courseId)];
      return next.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    });
  }

  function applyFeaturedCourseTemplate() {
    setCourse({
      name: featuredCourseTitle,
      description:
        'A focused, high-impact YouTube course that unlocks certificate generation after full completion.',
      duration: '1',
      videoUrl: featuredVideoUrl
    });
  }

  return (
    <div className="page-grid">
      <Panel
        subtitle="Create shared courses that are immediately visible to admins, super admins, and students."
        title="Create Course"
      >
        <div className="inline-actions">
          <button className="btn btn-outline" onClick={applyFeaturedCourseTemplate} type="button">
            Use Featured YouTube Course
          </button>
          <button
            className="btn btn-outline"
            onClick={() => void loadCourses()}
            type="button"
          >
            Refresh Catalog
          </button>
        </div>

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
            <span>Course video URL</span>
            <input
              onChange={(event) => setCourse({ ...course, videoUrl: event.target.value })}
              placeholder="https://youtu.be/..."
              value={course.videoUrl}
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
          {createTask.error && <ErrorMessage message={createTask.error} />}
          {createTask.success && <SuccessMessage message={createTask.success} />}

          <button className="btn" disabled={createTask.loading} type="submit">
            {createTask.loading ? 'Creating...' : 'Create Course'}
          </button>
        </form>
      </Panel>

      <Panel
        subtitle="This is the real saved course catalog available across admin and super admin."
        title="Course Catalog"
      >
        <HintMessage message="Any active course listed here is available for students to discover under Available Courses and enroll from there." />

        <label className="field">
          <span>Search by code, name, or status</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type to search courses"
            value={search}
          />
        </label>

        {courseTask.error && <ErrorMessage message={courseTask.error} />}

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
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((item) => (
                <tr key={item.courseId}>
                  <td>{item.courseCode}</td>
                  <td>{item.name}</td>
                  <td>{item.description ?? '-'}</td>
                  <td>{item.duration} days</td>
                  <td>{item.status}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
              {filteredCourses.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {createdCourses.length === 0
                      ? 'No saved courses found yet.'
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
