export const FEATURED_COURSE_VIDEO_URL =
  'https://youtu.be/bTPO0qnIoTs?si=jvyfocgztOi78Pp8';

export const FEATURED_COURSE_IMPACT_TITLE = 'AI Launchpad';

const VIDEO_URL_MARKER = '[VIDEO_URL]';

export function appendCourseVideoToDescription(
  description: string | undefined,
  videoUrl: string | undefined
): string | undefined {
  const normalizedDescription = description?.trim() ?? '';
  const normalizedVideoUrl = videoUrl?.trim() ?? '';

  if (!normalizedVideoUrl) {
    return normalizedDescription || undefined;
  }

  return normalizedDescription
    ? `${normalizedDescription}\n\n${VIDEO_URL_MARKER}${normalizedVideoUrl}`
    : `${VIDEO_URL_MARKER}${normalizedVideoUrl}`;
}

export function extractCourseVideoUrl(description: string | null | undefined): string | null {
  if (!description) {
    return null;
  }

  const markerIndex = description.indexOf(VIDEO_URL_MARKER);
  if (markerIndex >= 0) {
    const value = description.slice(markerIndex + VIDEO_URL_MARKER.length).trim();
    return value || null;
  }

  const match = description.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+/i);
  return match?.[0] ?? null;
}

export function buildImpactCourseTitle(courseName: string, videoUrl: string | null): string {
  if (videoUrl === FEATURED_COURSE_VIDEO_URL) {
    return FEATURED_COURSE_IMPACT_TITLE;
  }

  const normalized = courseName.trim();
  if (!normalized) {
    return FEATURED_COURSE_IMPACT_TITLE;
  }

  const words = normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  return words.join(' ');
}
