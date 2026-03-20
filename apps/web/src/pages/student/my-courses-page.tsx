import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { StudentDashboardResponse } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDate, formatDateTime } from '../../lib/format';

type EnrolledCourse = StudentDashboardResponse['enrolledCourses'][number];

type CourseCompletionResponse = {
  enrollmentId: string;
  status: string;
  completionPercentage: number;
  certificate: {
    certificateId: string;
    certificateNo: string;
    issuedAt: string;
    downloadUrl: string;
    verificationUrl: string;
    verificationApiUrl: string;
  };
};

type YouTubePlayerLike = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

function getVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

function loadYouTubeApi() {
  return new Promise<void>((resolve) => {
    const scopedWindow = window as typeof window & {
      YT?: { Player?: unknown };
      onYouTubeIframeAPIReady?: () => void;
    };

    if (scopedWindow.YT?.Player) {
      resolve();
      return;
    }

    if (!document.querySelector('script[data-youtube-api="true"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeApi = 'true';
      document.body.appendChild(script);
    }

    scopedWindow.onYouTubeIframeAPIReady = () => resolve();
  });
}

export function MyCoursesPage() {
  const [batchId, setBatchId] = useState('');
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [courseActionMessage, setCourseActionMessage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  const dashboardTask = useApiTask();
  const enrollTask = useApiTask();
  const completionTask = useApiTask();
  const playerRef = useRef<YouTubePlayerLike | null>(null);
  const pollerRef = useRef<number | null>(null);

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    const response = await dashboardTask.run(() =>
      apiRequest<StudentDashboardResponse>(endpoints.student.dashboard)
    );
    if (response) {
      setData(response);
    }
  }

  async function onEnroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await enrollTask.run(
      () =>
        apiRequest<{
          enrollmentId: string;
          studentId: string;
          batchId: string;
          status: string;
          enrolledAt: string;
        }>(endpoints.student.enrollments, {
          method: 'POST',
          body: {
            batchId: batchId.trim()
          }
        }),
      'Enrollment completed.'
    );

    if (!response) {
      return;
    }

    setBatchId('');
    await loadDashboard();
  }

  const selectedCourse = useMemo<EnrolledCourse | null>(() => {
    if (!data?.enrolledCourses.length) {
      return null;
    }
    if (!selectedEnrollmentId) {
      return data.enrolledCourses.find((course) => Boolean(course.videoUrl)) ?? data.enrolledCourses[0];
    }
    return data.enrolledCourses.find((course) => course.enrollmentId === selectedEnrollmentId) ?? null;
  }, [data?.enrolledCourses, selectedEnrollmentId]);

  useEffect(() => {
    if (!selectedCourse?.videoUrl) {
      setProgressPercent(selectedCourse?.completionPercentage ?? 0);
      return;
    }

    let disposed = false;

    async function mountPlayer() {
      await loadYouTubeApi();
      if (disposed) {
        return;
      }

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      if (pollerRef.current) {
        window.clearInterval(pollerRef.current);
        pollerRef.current = null;
      }

      const scopedWindow = window as typeof window & {
        YT?: {
          Player: new (
            elementId: string,
            options: {
              videoId: string;
              playerVars?: Record<string, number>;
              events?: Record<string, (event: { data: number }) => void>;
            }
          ) => YouTubePlayerLike;
          PlayerState: { ENDED: number };
        };
      };

      const videoUrl = selectedCourse?.videoUrl;
      const enrollmentId = selectedCourse?.enrollmentId;
      const videoId = videoUrl ? getVideoId(videoUrl) : null;
      if (!scopedWindow.YT || !videoId) {
        return;
      }

      playerRef.current = new scopedWindow.YT.Player('student-course-player', {
        videoId,
        playerVars: {
          rel: 0
        },
        events: {
          onStateChange: (event) => {
            if (event.data === scopedWindow.YT?.PlayerState.ENDED) {
              setProgressPercent(100);
              if (enrollmentId) {
                void markCourseComplete(enrollmentId);
              }
            }
          }
        }
      });

      pollerRef.current = window.setInterval(() => {
        const player = playerRef.current;
        if (!player) {
          return;
        }

        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        if (duration > 0) {
          setProgressPercent(Math.min(100, Math.round((currentTime / duration) * 100)));
        }
      }, 1000);
    }

    void mountPlayer();

    return () => {
      disposed = true;
      if (pollerRef.current) {
        window.clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [selectedCourse?.enrollmentId, selectedCourse?.videoUrl]);

  useEffect(() => {
    setProgressPercent(selectedCourse?.completionPercentage ?? 0);
  }, [selectedCourse?.completionPercentage]);

  async function markCourseComplete(enrollmentId: string) {
    if (completionTask.loading) {
      return;
    }

    const response = await completionTask.run(
      () =>
        apiRequest<CourseCompletionResponse>(endpoints.student.completeCourse(enrollmentId), {
          method: 'POST'
        }),
      'Course completed and certificate generated.'
    );

    if (!response) {
      return;
    }

    setCourseActionMessage(`Certificate ${response.certificate.certificateNo} is now available.`);
    setData((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        enrolledCourses: previous.enrolledCourses.map((course) =>
          course.enrollmentId === enrollmentId
            ? {
                ...course,
                enrollmentStatus: response.status,
                completionPercentage: response.completionPercentage,
                certificateNo: response.certificate.certificateNo
              }
            : course
        )
      };
    });
  }

  return (
    <div className="page-grid">
      <Panel
        actions={
          <button className="btn btn-outline" onClick={() => void loadDashboard()} type="button">
            Refresh
          </button>
        }
        subtitle="Enroll in a new batch and view all your enrolled courses."
        title="My Courses"
      >
        <form className="inline-form" onSubmit={onEnroll}>
          <input
            onChange={(event) => setBatchId(event.target.value)}
            placeholder="Enter batch ID"
            required
            value={batchId}
          />
          <button className="btn" disabled={enrollTask.loading} type="submit">
            {enrollTask.loading ? 'Enrolling...' : 'Enroll'}
          </button>
        </form>

        {dashboardTask.error && <ErrorMessage message={dashboardTask.error} />}
        {enrollTask.error && <ErrorMessage message={enrollTask.error} />}
        {enrollTask.success && <SuccessMessage message={enrollTask.success} />}
      </Panel>

      <Panel
        subtitle="Watch the linked course video and earn your certificate after full completion."
        title="Course Player"
      >
        {selectedCourse?.videoUrl ? (
          <>
            <div className="message-block">
              <p>
                <strong>{selectedCourse.courseShortTitle}</strong>
              </p>
              <p className="tiny muted">{selectedCourse.courseName}</p>
              <p className="tiny muted">
                Progress: {Math.max(progressPercent, selectedCourse.completionPercentage)}%
              </p>
              {selectedCourse.certificateNo && (
                <p className="tiny muted">Certificate: {selectedCourse.certificateNo}</p>
              )}
            </div>

            <div className="course-player-shell">
              <div id="student-course-player" />
            </div>

            <HintMessage message="The certificate is generated automatically once the video reaches 100% completion." />
            {completionTask.error && <ErrorMessage message={completionTask.error} />}
            {completionTask.success && <SuccessMessage message={completionTask.success} />}
            {courseActionMessage && <SuccessMessage message={courseActionMessage} />}
          </>
        ) : (
          <HintMessage message="No YouTube-backed course is linked to your enrollments yet." />
        )}
      </Panel>

      <Panel subtitle="Current enrolled courses from dashboard API." title="Course Enrollments">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Lesson</th>
                <th>Batch</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Certificate</th>
                <th>Course Duration</th>
                <th>Batch Duration</th>
                <th>Enrolled At</th>
              </tr>
            </thead>
            <tbody>
              {data?.enrolledCourses.map((course) => (
                <tr key={course.enrollmentId}>
                  <td>
                    {course.courseShortTitle}
                    <div className="tiny muted">{course.courseName}</div>
                  </td>
                  <td>
                    {course.videoUrl ? (
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setSelectedEnrollmentId(course.enrollmentId);
                          setCourseActionMessage(null);
                          setProgressPercent(course.completionPercentage);
                        }}
                        type="button"
                      >
                        Watch
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{course.batchName}</td>
                  <td>{course.enrollmentStatus}</td>
                  <td>{course.completionPercentage}%</td>
                  <td>{course.certificateNo ?? '-'}</td>
                  <td>{course.durationDays} days</td>
                  <td>
                    {formatDate(course.batchStartDate)} - {formatDate(course.batchEndDate)}
                  </td>
                  <td>{formatDateTime(course.enrolledAt)}</td>
                </tr>
              ))}
              {!data?.enrolledCourses.length && (
                <tr>
                  <td colSpan={9}>No enrolled courses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
