import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime, formatPercent } from '../../lib/format';

type QuestionOption = {
  optionId: string;
  optionKey: 'A' | 'B' | 'C' | 'D';
  optionText: string;
};

type ExamQuestion = {
  questionId: string;
  questionText: string;
  imageKey: string | null;
  marks: number;
  options: QuestionOption[];
};

type CertificateSummary = {
  certificateId: string;
  certificateNo: string;
  issuedAt: string;
  downloadUrl: string;
  verificationUrl: string;
  verificationApiUrl: string;
};

type AttemptResult = {
  resultId: string;
  attemptId: string;
  examId: string;
  studentId: string;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  maxMarks: number;
  marksObtained: number;
  scorePercentage: number;
  passed: boolean;
  evaluatedAt: string;
  certificate: CertificateSummary | null;
};

type StartAttemptResponse = {
  attemptId: string;
  examId: string;
  attemptNo: number;
  startedAt: string;
  deadlineAt: string;
  remainingSeconds: number;
  timeLimitMinutes: number;
  status: string;
  questions: ExamQuestion[];
};

type AttemptStateResponse = {
  attemptId: string;
  examId: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  deadlineAt: string;
  remainingSeconds: number;
  answeredCount: number;
  result: AttemptResult | null;
};

type SubmissionResponse = {
  attemptId: string;
  status: string;
  autoSubmitted: boolean;
  reason?: string;
  result: AttemptResult;
};

type HeartbeatResponse = {
  attemptId: string;
  status: string;
  autoSubmitted: boolean;
  deadlineAt?: string;
  remainingSeconds?: number;
  result?: AttemptResult | null;
  reason?: string;
};

type SaveAnswerPayload = {
  answers: Array<{
    questionId: string;
    selectedOptionId?: string;
    isMarkedForReview?: boolean;
  }>;
};

const ONE_SECOND = 1000;
const HEARTBEAT_INTERVAL_MS = 15000;
const AUTO_SAVE_INTERVAL_MS = 12000;

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds
    ).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function ExamAttemptPage() {
  const [examIdInput, setExamIdInput] = useState('');
  const [attempt, setAttempt] = useState<StartAttemptResponse | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionByQuestion, setSelectedOptionByQuestion] = useState<
    Record<string, string | undefined>
  >({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [dirtyAnswers, setDirtyAnswers] = useState(false);
  const [activityInfo, setActivityInfo] = useState<string | null>(null);

  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [copyPasteCount, setCopyPasteCount] = useState(0);

  const startTask = useApiTask();
  const saveTask = useApiTask();
  const submitTask = useApiTask();
  const stateTask = useApiTask();

  const tabSwitchRef = useRef(0);
  const fullscreenExitRef = useRef(0);
  const copyPasteRef = useRef(0);
  const isSubmittingRef = useRef(false);

  const isAttemptActive = Boolean(
    attempt && !result && attempt.status !== 'EVALUATED' && attempt.status !== 'SUBMITTED'
  );

  const deadlineAtMs = useMemo(() => {
    if (!attempt?.deadlineAt) {
      return null;
    }
    const parsed = new Date(attempt.deadlineAt).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, [attempt?.deadlineAt]);

  const activeQuestion = useMemo(() => {
    if (!attempt || attempt.questions.length === 0) {
      return null;
    }
    return attempt.questions[currentQuestionIndex] ?? null;
  }, [attempt, currentQuestionIndex]);

  const answeredCount = useMemo(() => {
    if (!attempt) {
      return 0;
    }
    return attempt.questions.reduce((count, question) => {
      return selectedOptionByQuestion[question.questionId] ? count + 1 : count;
    }, 0);
  }, [attempt, selectedOptionByQuestion]);

  const markedCount = useMemo(() => {
    if (!attempt) {
      return 0;
    }
    return attempt.questions.reduce((count, question) => {
      return markedForReview[question.questionId] ? count + 1 : count;
    }, 0);
  }, [attempt, markedForReview]);

  useEffect(() => {
    tabSwitchRef.current = tabSwitchCount;
  }, [tabSwitchCount]);

  useEffect(() => {
    fullscreenExitRef.current = fullscreenExitCount;
  }, [fullscreenExitCount]);

  useEffect(() => {
    copyPasteRef.current = copyPasteCount;
  }, [copyPasteCount]);

  useEffect(() => {
    if (!attempt) {
      return;
    }
    setCurrentQuestionIndex((previous) =>
      Math.min(previous, Math.max(0, attempt.questions.length - 1))
    );
  }, [attempt]);

  useEffect(() => {
    if (!isAttemptActive) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!deadlineAtMs) {
        return;
      }
      const next = Math.max(0, Math.floor((deadlineAtMs - Date.now()) / ONE_SECOND));
      setRemainingSeconds(next);
      if (next === 0 && attempt && !isSubmittingRef.current) {
        isSubmittingRef.current = true;
        void submitExam(true);
      }
    }, ONE_SECOND);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAttemptActive, deadlineAtMs, attempt]);

  useEffect(() => {
    if (!isAttemptActive || !attempt) {
      return;
    }

    const interval = window.setInterval(() => {
      void sendHeartbeat(attempt.attemptId);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAttemptActive, attempt]);

  useEffect(() => {
    if (!isAttemptActive || !attempt || !dirtyAnswers) {
      return;
    }

    const interval = window.setInterval(() => {
      void saveAnswers(attempt.attemptId);
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAttemptActive, attempt, dirtyAnswers]);

  useEffect(() => {
    if (!isAttemptActive) {
      return;
    }

    function onVisibilityChange() {
      if (document.hidden) {
        setTabSwitchCount((previous) => previous + 1);
      }
    }

    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setFullscreenExitCount((previous) => previous + 1);
      }
    }

    function onClipboardEvent() {
      setCopyPasteCount((previous) => previous + 1);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onClipboardEvent);
    document.addEventListener('paste', onClipboardEvent);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onClipboardEvent);
      document.removeEventListener('paste', onClipboardEvent);
    };
  }, [isAttemptActive]);

  useEffect(() => {
    if (!isAttemptActive) {
      return;
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    function onRefreshShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const isRefreshShortcut =
        event.key === 'F5' || ((event.ctrlKey || event.metaKey) && key === 'r');
      if (!isRefreshShortcut) {
        return;
      }
      event.preventDefault();
      setActivityInfo('Refresh is blocked during an active attempt.');
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onRefreshShortcut);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onRefreshShortcut);
    };
  }, [isAttemptActive]);

  async function startExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setActivityInfo(null);

    const response = await startTask.run(() =>
      apiRequest<StartAttemptResponse>(endpoints.student.startExam(examIdInput.trim()), {
        method: 'POST'
      })
    );

    if (!response) {
      return;
    }

    const initialAnswers: Record<string, string | undefined> = {};
    response.questions.forEach((question) => {
      initialAnswers[question.questionId] = undefined;
    });

    setAttempt(response);
    setCurrentQuestionIndex(0);
    setSelectedOptionByQuestion(initialAnswers);
    setMarkedForReview({});
    setRemainingSeconds(response.remainingSeconds);
    setDirtyAnswers(false);
    setTabSwitchCount(0);
    setFullscreenExitCount(0);
    setCopyPasteCount(0);
    isSubmittingRef.current = false;
    setActivityInfo(`Attempt #${response.attemptNo} started.`);
  }

  function onSelectOption(questionId: string, optionId: string) {
    setSelectedOptionByQuestion((previous) => ({
      ...previous,
      [questionId]: optionId
    }));
    setDirtyAnswers(true);
  }

  function onToggleMarkForReview(questionId: string, nextValue: boolean) {
    setMarkedForReview((previous) => ({
      ...previous,
      [questionId]: nextValue
    }));
    setDirtyAnswers(true);
  }

  function buildAnswerPayload(): SaveAnswerPayload {
    if (!attempt) {
      return {
        answers: []
      };
    }

    return {
      answers: attempt.questions.map((question) => ({
        questionId: question.questionId,
        selectedOptionId: selectedOptionByQuestion[question.questionId],
        isMarkedForReview: markedForReview[question.questionId] ?? false
      }))
    };
  }

  async function saveAnswers(attemptId: string) {
    const payload = buildAnswerPayload();
    if (payload.answers.length === 0) {
      return;
    }

    const response = await saveTask.run(() =>
      apiRequest<{
        attemptId: string;
        answeredCount: number;
        remainingSeconds: number;
        deadlineAt: string;
      }>(endpoints.student.saveAnswers(attemptId), {
        method: 'PATCH',
        body: payload
      })
    );

    if (!response) {
      return;
    }

    setRemainingSeconds(response.remainingSeconds);
    setDirtyAnswers(false);
    setActivityInfo(`Saved answers (${response.answeredCount} answered).`);
  }

  async function sendHeartbeat(attemptId: string) {
    const response = await apiRequest<HeartbeatResponse>(endpoints.student.heartbeat(attemptId), {
      method: 'POST',
      body: {
        tabSwitchCount: tabSwitchRef.current,
        fullscreenExitCount: fullscreenExitRef.current,
        copyPasteCount: copyPasteRef.current,
        devToolsOpen: false,
        multipleFaceDetected: false
      }
    });

    if (response.remainingSeconds !== undefined) {
      setRemainingSeconds(response.remainingSeconds);
    }

    if (response.status === 'EVALUATED' || response.result) {
      if (response.result) {
        setResult(response.result);
      }
      setAttempt((previous) =>
        previous
          ? {
              ...previous,
              status: response.status
            }
          : previous
      );
      setActivityInfo(response.autoSubmitted ? 'Attempt auto-submitted.' : 'Attempt evaluated.');
      isSubmittingRef.current = false;
    }
  }

  async function submitExam(isAutoSubmit: boolean) {
    if (!attempt) {
      return;
    }

    await saveAnswers(attempt.attemptId);

    const timeSpentSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / ONE_SECOND)
    );
    const response = await submitTask.run(() =>
      apiRequest<SubmissionResponse>(endpoints.student.submitAttempt(attempt.attemptId), {
        method: 'POST',
        body: {
          timeSpentSeconds
        }
      })
    );

    if (!response) {
      isSubmittingRef.current = false;
      return;
    }

    setResult(response.result);
    setAttempt((previous) =>
      previous
        ? {
            ...previous,
            status: response.status
          }
        : previous
    );
    setActivityInfo(isAutoSubmit ? 'Time ended. Auto-submitted.' : 'Exam submitted.');
    isSubmittingRef.current = false;
  }

  async function onManualSubmit() {
    if (!isAttemptActive) {
      return;
    }

    const confirmed = window.confirm(
      'Submit exam now? You will not be able to change answers after submission.'
    );
    if (!confirmed) {
      return;
    }

    isSubmittingRef.current = true;
    await submitExam(false);
  }

  async function refreshAttemptState() {
    if (!attempt) {
      return;
    }

    const response = await stateTask.run(() =>
      apiRequest<AttemptStateResponse>(endpoints.student.attemptState(attempt.attemptId))
    );

    if (!response) {
      return;
    }

    setAttempt((previous) =>
      previous
        ? {
            ...previous,
            status: response.status,
            deadlineAt: response.deadlineAt
          }
        : previous
    );
    setRemainingSeconds(response.remainingSeconds);
    setResult(response.result);
    setActivityInfo('Attempt state refreshed.');
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Start exam by exam ID." title="Start Exam">
        <form className="inline-form" onSubmit={startExam}>
          <input
            onChange={(event) => setExamIdInput(event.target.value)}
            placeholder="Enter exam ID"
            required
            value={examIdInput}
          />
          <button className="btn" disabled={startTask.loading} type="submit">
            {startTask.loading ? 'Starting...' : 'Start Attempt'}
          </button>
        </form>
        {startTask.error && <ErrorMessage message={startTask.error} />}
        {activityInfo && <SuccessMessage message={activityInfo} />}
      </Panel>

      {attempt && (
        <Panel
          actions={
            <div className="inline-actions">
              <button
                className="btn btn-outline"
                disabled={saveTask.loading || !isAttemptActive}
                onClick={() => void saveAnswers(attempt.attemptId)}
                type="button"
              >
                Save Answers
              </button>
              <button
                className="btn btn-outline"
                disabled={stateTask.loading}
                onClick={() => void refreshAttemptState()}
                type="button"
              >
                Refresh State
              </button>
              <button
                className="btn btn-danger"
                disabled={submitTask.loading || !isAttemptActive}
                onClick={() => void onManualSubmit()}
                type="button"
              >
                Submit
              </button>
            </div>
          }
          subtitle={`Attempt ID: ${attempt.attemptId}`}
          title={`Exam Attempt #${attempt.attemptNo}`}
        >
          <div className="attempt-meta">
            <p>
              Status: <strong>{attempt.status}</strong>
            </p>
            <p>
              Started: <strong>{formatDateTime(attempt.startedAt)}</strong>
            </p>
            <p>
              Deadline: <strong>{formatDateTime(attempt.deadlineAt)}</strong>
            </p>
            <p>
              Remaining: <strong>{formatDuration(remainingSeconds)}</strong>
            </p>
            <p>
              Progress: <strong>{answeredCount}/{attempt.questions.length}</strong>
            </p>
            <p>
              Marked: <strong>{markedCount}</strong>
            </p>
          </div>

          <div className="anti-cheat-box">
            <p className="tiny">
              Anti-cheat telemetry: tab switches {tabSwitchCount}, fullscreen exits{' '}
              {fullscreenExitCount}, copy/paste {copyPasteCount}
            </p>
            <p className="tiny muted">Page refresh is blocked while the attempt is active.</p>
          </div>

          {saveTask.error && <ErrorMessage message={saveTask.error} />}
          {submitTask.error && <ErrorMessage message={submitTask.error} />}
          {stateTask.error && <ErrorMessage message={stateTask.error} />}

          {activeQuestion && (
            <div className="question-list">
              <div className="inline-actions">
                <button
                  className="btn btn-outline"
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex((previous) => previous - 1)}
                  type="button"
                >
                  Previous
                </button>
                <p>
                  Question {currentQuestionIndex + 1} of {attempt.questions.length}
                </p>
                <button
                  className="btn btn-outline"
                  disabled={currentQuestionIndex >= attempt.questions.length - 1}
                  onClick={() => setCurrentQuestionIndex((previous) => previous + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>

              <article className="question-card">
                <header className="question-header">
                  <p>
                    Q{currentQuestionIndex + 1}. {activeQuestion.questionText}
                  </p>
                  <small>{activeQuestion.marks} mark(s)</small>
                </header>

                {activeQuestion.imageKey && (
                  <div className="question-image-wrap">
                    <img
                      alt={`Question ${currentQuestionIndex + 1}`}
                      className="question-image"
                      src={`/uploads/${activeQuestion.imageKey}`}
                    />
                  </div>
                )}

                <div className="options-grid">
                  {activeQuestion.options.map((option) => (
                    <label className="option-row" key={option.optionId}>
                      <input
                        checked={
                          selectedOptionByQuestion[activeQuestion.questionId] === option.optionId
                        }
                        disabled={!isAttemptActive}
                        name={`question-${activeQuestion.questionId}`}
                        onChange={() => onSelectOption(activeQuestion.questionId, option.optionId)}
                        type="radio"
                      />
                      <span>
                        {option.optionKey}. {option.optionText}
                      </span>
                    </label>
                  ))}
                </div>

                <label className="review-toggle">
                  <input
                    checked={markedForReview[activeQuestion.questionId] ?? false}
                    disabled={!isAttemptActive}
                    onChange={(event) =>
                      onToggleMarkForReview(activeQuestion.questionId, event.target.checked)
                    }
                    type="checkbox"
                  />
                  Mark for review
                </label>
              </article>
            </div>
          )}
        </Panel>
      )}

      {result && (
        <Panel subtitle="Auto-evaluated using backend answer key." title="Attempt Result">
          {result.passed ? (
            <SuccessMessage message="Status: Passed" />
          ) : (
            <ErrorMessage message="Status: Failed" />
          )}
          <div className="stat-grid compact">
            <HintMessage
              message={`Score: ${result.marksObtained}/${result.maxMarks} (${formatPercent(
                result.scorePercentage
              )})`}
            />
            <HintMessage
              message={`Correct ${result.correctAnswers}, Wrong ${result.wrongAnswers}, Unanswered ${result.unanswered}`}
            />
            <HintMessage message={`Status: ${result.passed ? 'Passed' : 'Failed'}`} />
          </div>
          {result.certificate && (
            <div className="message-block">
              <p>Certificate generated: {result.certificate.certificateNo}</p>
              <a
                className="btn btn-outline"
                href={result.certificate.verificationUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open Verification Page
              </a>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
