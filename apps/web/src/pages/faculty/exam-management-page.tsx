import { FormEvent, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDateTime } from '../../lib/format';

type ExamResponse = {
  examId: string;
  title: string;
  description: string | null;
  batchId: string;
  courseId: string;
  timeLimitMinutes: number;
  totalMarks: number;
  maxAttempts: number;
  scheduledAt: string;
  endsAt: string;
  status: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  createdAt: string;
  updatedAt: string;
};

type QuestionImageUploadResponse = {
  imageKey: string;
  imageName: string;
  imageUrl: string;
};

type QuestionResponse = {
  questionId: string;
  examId: string;
  questionText: string;
  imageKey: string | null;
  marks: number;
  displayOrder: number;
};

type OptionKey = 'A' | 'B' | 'C' | 'D';

type QuestionDraft = {
  localId: string;
  questionText: string;
  imageKey: string;
  marks: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
};

const optionKeys: OptionKey[] = ['A', 'B', 'C', 'D'];

function createQuestionDraft(id: number): QuestionDraft {
  return {
    localId: `q-${id}`,
    questionText: '',
    imageKey: '',
    marks: '1',
    options: {
      A: '',
      B: '',
      C: '',
      D: ''
    },
    correct: 'A'
  };
}

export function ExamManagementPage() {
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    batchId: '',
    scheduledAt: '',
    timeLimitMinutes: '30',
    totalMarks: '100',
    maxAttempts: '1',
    shuffleQuestions: false,
    shuffleOptions: false
  });
  const [updateForm, setUpdateForm] = useState({
    examId: '',
    title: '',
    description: '',
    batchId: '',
    scheduledAt: '',
    timeLimitMinutes: '',
    totalMarks: '',
    maxAttempts: '',
    shuffleQuestions: false,
    shuffleOptions: false
  });
  const [deleteExamId, setDeleteExamId] = useState('');
  const [createdExams, setCreatedExams] = useState<ExamResponse[]>([]);

  const [activeExamId, setActiveExamId] = useState('');
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([createQuestionDraft(1)]);
  const [draftCounter, setDraftCounter] = useState(2);
  const [questionFiles, setQuestionFiles] = useState<Record<string, File | null>>({});
  const [uploadingDraftId, setUploadingDraftId] = useState<string | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderSuccess, setBuilderSuccess] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<QuestionImageUploadResponse | null>(null);
  const [recentQuestions, setRecentQuestions] = useState<QuestionResponse[]>([]);

  const createTask = useApiTask();
  const updateTask = useApiTask();
  const deleteTask = useApiTask();
  const uploadTask = useApiTask();
  const questionTask = useApiTask();

  const examIdList = useMemo(
    () => Array.from(new Set(createdExams.map((exam) => exam.examId))),
    [createdExams]
  );

  async function onCreateExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBuilderError(null);
    setBuilderSuccess(null);

    const response = await createTask.run(
      () =>
        apiRequest<ExamResponse>(endpoints.faculty.exams, {
          method: 'POST',
          body: {
            title: createForm.title.trim(),
            description: createForm.description.trim() || undefined,
            batchId: createForm.batchId.trim(),
            scheduledAt: new Date(createForm.scheduledAt).toISOString(),
            timeLimitMinutes: Number(createForm.timeLimitMinutes),
            totalMarks: Number(createForm.totalMarks),
            maxAttempts: Number(createForm.maxAttempts),
            shuffleQuestions: createForm.shuffleQuestions,
            shuffleOptions: createForm.shuffleOptions
          }
        }),
      'Exam created successfully.'
    );

    if (!response) {
      return;
    }

    setCreatedExams((previous) => [response, ...previous]);
    setActiveExamId(response.examId);
    setQuestionDrafts([createQuestionDraft(1)]);
    setDraftCounter(2);
    setQuestionFiles({});
    setBuilderSuccess(
      `Exam ${response.examId} created. Add questions below, then click "Save All Questions".`
    );

    setCreateForm({
      title: '',
      description: '',
      batchId: '',
      scheduledAt: '',
      timeLimitMinutes: '30',
      totalMarks: '100',
      maxAttempts: '1',
      shuffleQuestions: false,
      shuffleOptions: false
    });
  }

  async function onUpdateExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!updateForm.examId.trim()) {
      return;
    }

    const payload: Record<string, unknown> = {};
    if (updateForm.title.trim()) payload.title = updateForm.title.trim();
    if (updateForm.description.trim()) payload.description = updateForm.description.trim();
    if (updateForm.batchId.trim()) payload.batchId = updateForm.batchId.trim();
    if (updateForm.scheduledAt) payload.scheduledAt = new Date(updateForm.scheduledAt).toISOString();
    if (updateForm.timeLimitMinutes) payload.timeLimitMinutes = Number(updateForm.timeLimitMinutes);
    if (updateForm.totalMarks) payload.totalMarks = Number(updateForm.totalMarks);
    if (updateForm.maxAttempts) payload.maxAttempts = Number(updateForm.maxAttempts);
    payload.shuffleQuestions = updateForm.shuffleQuestions;
    payload.shuffleOptions = updateForm.shuffleOptions;

    const response = await updateTask.run(
      () =>
        apiRequest<ExamResponse>(endpoints.faculty.examById(updateForm.examId.trim()), {
          method: 'PATCH',
          body: payload
        }),
      'Exam updated successfully.'
    );

    if (!response) {
      return;
    }

    setCreatedExams((previous) => {
      const hasMatch = previous.some((item) => item.examId === response.examId);
      if (!hasMatch) {
        return [response, ...previous];
      }
      return previous.map((item) => (item.examId === response.examId ? response : item));
    });
  }

  async function onDeleteExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetExamId = deleteExamId.trim();
    if (!targetExamId) {
      return;
    }

    const response = await deleteTask.run(
      () =>
        apiRequest<{ examId: string; deleted: boolean }>(endpoints.faculty.examById(targetExamId), {
          method: 'DELETE'
        }),
      'Exam deleted.'
    );

    if (!response) {
      return;
    }

    setCreatedExams((previous) => previous.filter((item) => item.examId !== response.examId));
    if (activeExamId === response.examId) {
      setActiveExamId('');
    }
    setDeleteExamId('');
  }

  function addQuestionDraft() {
    setQuestionDrafts((previous) => [...previous, createQuestionDraft(draftCounter)]);
    setDraftCounter((previous) => previous + 1);
    setBuilderError(null);
    setBuilderSuccess(null);
  }

  function removeQuestionDraft(localId: string) {
    if (questionDrafts.length === 1) {
      setQuestionDrafts([createQuestionDraft(draftCounter)]);
      setDraftCounter((previous) => previous + 1);
      setQuestionFiles({});
      return;
    }
    setQuestionDrafts((previous) => previous.filter((draft) => draft.localId !== localId));
    setQuestionFiles((previous) => ({
      ...previous,
      [localId]: null
    }));
  }

  function updateDraft(localId: string, updater: (current: QuestionDraft) => QuestionDraft) {
    setQuestionDrafts((previous) =>
      previous.map((draft) => (draft.localId === localId ? updater(draft) : draft))
    );
  }

  function validateDraft(draft: QuestionDraft, index: number): string | null {
    if (!draft.questionText.trim()) {
      return `Question ${index + 1}: question text is required.`;
    }

    const marks = Number(draft.marks);
    if (!Number.isFinite(marks) || marks <= 0) {
      return `Question ${index + 1}: marks must be greater than 0.`;
    }

    for (const key of optionKeys) {
      if (!draft.options[key].trim()) {
        return `Question ${index + 1}: option ${key} is required.`;
      }
    }

    return null;
  }

  async function onUploadQuestionImage(localId: string) {
    const file = questionFiles[localId];
    if (!file) {
      setBuilderError('Choose an image file before uploading.');
      setBuilderSuccess(null);
      return;
    }

    setBuilderError(null);
    setBuilderSuccess(null);
    setUploadingDraftId(localId);

    const formData = new FormData();
    formData.append('file', file);

    const response = await uploadTask.run(
      () =>
        apiRequest<QuestionImageUploadResponse>(endpoints.faculty.uploadQuestionImage, {
          method: 'POST',
          body: formData
        }),
      'Image uploaded successfully.'
    );

    setUploadingDraftId(null);
    if (!response) {
      return;
    }

    updateDraft(localId, (draft) => ({
      ...draft,
      imageKey: response.imageKey
    }));
    setLastUpload(response);
    setQuestionFiles((previous) => ({
      ...previous,
      [localId]: null
    }));
  }

  async function onSaveAllQuestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBuilderError(null);
    setBuilderSuccess(null);

    const examId = activeExamId.trim();
    if (!examId) {
      setBuilderError('Exam ID is required. Create/select an exam first.');
      return;
    }

    if (questionDrafts.length === 0) {
      setBuilderError('Add at least one question.');
      return;
    }

    for (let index = 0; index < questionDrafts.length; index += 1) {
      const validation = validateDraft(questionDrafts[index], index);
      if (validation) {
        setBuilderError(validation);
        return;
      }
    }

    const created = await questionTask.run(async () => {
      const createdRows: QuestionResponse[] = [];

      for (const draft of questionDrafts) {
        const response = await apiRequest<QuestionResponse>(endpoints.faculty.addQuestion(examId), {
          method: 'POST',
          body: {
            questionText: draft.questionText.trim(),
            imageKey: draft.imageKey.trim() || undefined,
            marks: Number(draft.marks),
            options: optionKeys.map((key) => ({
              optionKey: key,
              optionText: draft.options[key].trim(),
              isCorrect: key === draft.correct
            }))
          }
        });
        createdRows.push(response);
      }

      return createdRows;
    }, `${questionDrafts.length} question(s) added to exam ${examId}.`);

    if (!created) {
      return;
    }

    setRecentQuestions((previous) => [...created, ...previous]);
    setQuestionDrafts([createQuestionDraft(draftCounter)]);
    setDraftCounter((previous) => previous + 1);
    setQuestionFiles({});
    setBuilderSuccess(`${created.length} question(s) saved for exam ${examId}.`);
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Create exam with duration and batch assignment." title="Create Exam">
        <form className="stack-form" onSubmit={onCreateExam}>
          <label className="field">
            <span>Title</span>
            <input
              onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
              required
              value={createForm.title}
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
              rows={3}
              value={createForm.description}
            />
          </label>

          <div className="field-grid two">
            <label className="field">
              <span>Batch ID</span>
              <input
                onChange={(event) => setCreateForm({ ...createForm, batchId: event.target.value })}
                required
                value={createForm.batchId}
              />
            </label>
            <label className="field">
              <span>Scheduled Date/Time</span>
              <input
                onChange={(event) => setCreateForm({ ...createForm, scheduledAt: event.target.value })}
                required
                type="datetime-local"
                value={createForm.scheduledAt}
              />
            </label>
          </div>

          <div className="field-grid three">
            <label className="field">
              <span>Duration (minutes)</span>
              <input
                min={1}
                onChange={(event) =>
                  setCreateForm({ ...createForm, timeLimitMinutes: event.target.value })
                }
                required
                type="number"
                value={createForm.timeLimitMinutes}
              />
            </label>
            <label className="field">
              <span>Total Marks</span>
              <input
                min={0.01}
                onChange={(event) => setCreateForm({ ...createForm, totalMarks: event.target.value })}
                required
                step="0.01"
                type="number"
                value={createForm.totalMarks}
              />
            </label>
            <label className="field">
              <span>Max Attempts</span>
              <input
                min={1}
                onChange={(event) => setCreateForm({ ...createForm, maxAttempts: event.target.value })}
                required
                type="number"
                value={createForm.maxAttempts}
              />
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input
                checked={createForm.shuffleQuestions}
                onChange={(event) =>
                  setCreateForm({ ...createForm, shuffleQuestions: event.target.checked })
                }
                type="checkbox"
              />
              Shuffle questions
            </label>
            <label>
              <input
                checked={createForm.shuffleOptions}
                onChange={(event) =>
                  setCreateForm({ ...createForm, shuffleOptions: event.target.checked })
                }
                type="checkbox"
              />
              Shuffle options
            </label>
          </div>

          {createTask.error && <ErrorMessage message={createTask.error} />}
          {createTask.success && <SuccessMessage message={createTask.success} />}

          <button className="btn" disabled={createTask.loading} type="submit">
            {createTask.loading ? 'Creating...' : 'Create Exam'}
          </button>
        </form>
      </Panel>

      <Panel subtitle="Dynamic MCQ builder with per-question image upload." title="Question Builder">
        <HintMessage message="Uses existing APIs only: `POST /faculty/questions/images` and `POST /faculty/exams/:examId/questions`." />
        <form className="stack-form" onSubmit={onSaveAllQuestions}>
          <label className="field">
            <span>Exam ID for question save</span>
            <input
              list="exam-id-options"
              onChange={(event) => setActiveExamId(event.target.value)}
              placeholder="Create exam above or enter existing exam ID"
              required
              value={activeExamId}
            />
          </label>

          <div className="inline-actions">
            <button className="btn btn-outline" onClick={addQuestionDraft} type="button">
              Add Question Card
            </button>
          </div>

          <div className="question-list">
            {questionDrafts.map((draft, index) => (
              <div className="question-card" key={draft.localId}>
                <div className="question-header">
                  <p>Question {index + 1}</p>
                  <button
                    className="btn btn-outline danger-on-hover"
                    onClick={() => removeQuestionDraft(draft.localId)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>

                <div className="field-grid two">
                  <label className="field">
                    <span>Marks</span>
                    <input
                      min={0.01}
                      onChange={(event) =>
                        updateDraft(draft.localId, (current) => ({
                          ...current,
                          marks: event.target.value
                        }))
                      }
                      required
                      step="0.01"
                      type="number"
                      value={draft.marks}
                    />
                  </label>

                  <label className="field">
                    <span>Correct Option</span>
                    <select
                      onChange={(event) =>
                        updateDraft(draft.localId, (current) => ({
                          ...current,
                          correct: event.target.value as OptionKey
                        }))
                      }
                      value={draft.correct}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Question Text</span>
                  <textarea
                    onChange={(event) =>
                      updateDraft(draft.localId, (current) => ({
                        ...current,
                        questionText: event.target.value
                      }))
                    }
                    required
                    rows={3}
                    value={draft.questionText}
                  />
                </label>

                <label className="field">
                  <span>Image Key (optional)</span>
                  <input
                    onChange={(event) =>
                      updateDraft(draft.localId, (current) => ({
                        ...current,
                        imageKey: event.target.value
                      }))
                    }
                    placeholder="question-images/..."
                    value={draft.imageKey}
                  />
                </label>

                <div className="field-grid two">
                  {optionKeys.map((option) => (
                    <label className="field" key={option}>
                      <span>Option {option}</span>
                      <input
                        onChange={(event) =>
                          updateDraft(draft.localId, (current) => ({
                            ...current,
                            options: {
                              ...current.options,
                              [option]: event.target.value
                            }
                          }))
                        }
                        required
                        value={draft.options[option]}
                      />
                    </label>
                  ))}
                </div>

                <div className="field-grid two">
                  <label className="field">
                    <span>Upload Image</span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        setQuestionFiles((previous) => ({
                          ...previous,
                          [draft.localId]: event.target.files?.[0] ?? null
                        }))
                      }
                      type="file"
                    />
                  </label>

                  <div className="actions-cell">
                    <button
                      className="btn btn-outline"
                      disabled={uploadTask.loading}
                      onClick={() => void onUploadQuestionImage(draft.localId)}
                      type="button"
                    >
                      {uploadTask.loading && uploadingDraftId === draft.localId
                        ? 'Uploading...'
                        : 'Upload For This Question'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {builderError && <ErrorMessage message={builderError} />}
          {builderSuccess && <SuccessMessage message={builderSuccess} />}
          {uploadTask.error && <ErrorMessage message={uploadTask.error} />}
          {uploadTask.success && <SuccessMessage message={uploadTask.success} />}
          {questionTask.error && <ErrorMessage message={questionTask.error} />}
          {questionTask.success && <SuccessMessage message={questionTask.success} />}

          <button className="btn" disabled={questionTask.loading} type="submit">
            {questionTask.loading ? 'Saving Questions...' : 'Save All Questions'}
          </button>
        </form>

        {lastUpload && (
          <div className="message-block">
            <p>Last uploaded imageKey: {lastUpload.imageKey}</p>
            <p className="tiny muted">URL: {lastUpload.imageUrl}</p>
          </div>
        )}
      </Panel>

      <Panel subtitle="Optional exam maintenance." title="Update Exam">
        <form className="stack-form" onSubmit={onUpdateExam}>
          <label className="field">
            <span>Exam ID (required)</span>
            <input
              list="exam-id-options"
              onChange={(event) => setUpdateForm({ ...updateForm, examId: event.target.value })}
              required
              value={updateForm.examId}
            />
          </label>
          <datalist id="exam-id-options">
            {examIdList.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>

          <div className="field-grid two">
            <label className="field">
              <span>Title (optional)</span>
              <input
                onChange={(event) => setUpdateForm({ ...updateForm, title: event.target.value })}
                value={updateForm.title}
              />
            </label>
            <label className="field">
              <span>Batch ID (optional)</span>
              <input
                onChange={(event) => setUpdateForm({ ...updateForm, batchId: event.target.value })}
                value={updateForm.batchId}
              />
            </label>
          </div>

          <label className="field">
            <span>Description (optional)</span>
            <textarea
              onChange={(event) => setUpdateForm({ ...updateForm, description: event.target.value })}
              rows={3}
              value={updateForm.description}
            />
          </label>

          <div className="field-grid three">
            <label className="field">
              <span>Scheduled Date/Time</span>
              <input
                onChange={(event) => setUpdateForm({ ...updateForm, scheduledAt: event.target.value })}
                type="datetime-local"
                value={updateForm.scheduledAt}
              />
            </label>
            <label className="field">
              <span>Time Limit (minutes)</span>
              <input
                min={1}
                onChange={(event) =>
                  setUpdateForm({ ...updateForm, timeLimitMinutes: event.target.value })
                }
                type="number"
                value={updateForm.timeLimitMinutes}
              />
            </label>
            <label className="field">
              <span>Total Marks</span>
              <input
                min={0.01}
                onChange={(event) => setUpdateForm({ ...updateForm, totalMarks: event.target.value })}
                step="0.01"
                type="number"
                value={updateForm.totalMarks}
              />
            </label>
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>Max Attempts</span>
              <input
                min={1}
                onChange={(event) => setUpdateForm({ ...updateForm, maxAttempts: event.target.value })}
                type="number"
                value={updateForm.maxAttempts}
              />
            </label>

            <div className="toggle-row">
              <label>
                <input
                  checked={updateForm.shuffleQuestions}
                  onChange={(event) =>
                    setUpdateForm({ ...updateForm, shuffleQuestions: event.target.checked })
                  }
                  type="checkbox"
                />
                Shuffle questions
              </label>
              <label>
                <input
                  checked={updateForm.shuffleOptions}
                  onChange={(event) =>
                    setUpdateForm({ ...updateForm, shuffleOptions: event.target.checked })
                  }
                  type="checkbox"
                />
                Shuffle options
              </label>
            </div>
          </div>

          {updateTask.error && <ErrorMessage message={updateTask.error} />}
          {updateTask.success && <SuccessMessage message={updateTask.success} />}

          <button className="btn" disabled={updateTask.loading} type="submit">
            {updateTask.loading ? 'Updating...' : 'Update Exam'}
          </button>
        </form>
      </Panel>

      <Panel subtitle="Delete exam by ID." title="Delete Exam">
        <form className="inline-form" onSubmit={onDeleteExam}>
          <input
            list="exam-id-options"
            onChange={(event) => setDeleteExamId(event.target.value)}
            placeholder="Exam ID"
            required
            value={deleteExamId}
          />
          <button className="btn btn-danger" disabled={deleteTask.loading} type="submit">
            {deleteTask.loading ? 'Deleting...' : 'Delete'}
          </button>
        </form>
        {deleteTask.error && <ErrorMessage message={deleteTask.error} />}
        {deleteTask.success && <SuccessMessage message={deleteTask.success} />}
      </Panel>

      <Panel subtitle="Exams touched in this session." title="Session Exam Records">
        <HintMessage message="Current API set does not expose list-all-exams for faculty. This table shows session records." />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Batch ID</th>
                <th>Duration</th>
                <th>Total Marks</th>
                <th>Schedule</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {createdExams.map((exam) => (
                <tr key={exam.examId}>
                  <td>
                    {exam.title}
                    <div className="tiny muted">ID: {exam.examId}</div>
                  </td>
                  <td>{exam.batchId}</td>
                  <td>{exam.timeLimitMinutes} mins</td>
                  <td>{exam.totalMarks}</td>
                  <td>{formatDateTime(exam.scheduledAt)}</td>
                  <td>{exam.status}</td>
                </tr>
              ))}
              {createdExams.length === 0 && (
                <tr>
                  <td colSpan={6}>No exams created/updated in this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel subtitle="Questions added via exam builder in this session." title="Recent Questions">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam ID</th>
                <th>Order</th>
                <th>Question</th>
                <th>Marks</th>
                <th>Image Key</th>
              </tr>
            </thead>
            <tbody>
              {recentQuestions.map((question) => (
                <tr key={question.questionId}>
                  <td>{question.examId}</td>
                  <td>{question.displayOrder}</td>
                  <td>{question.questionText}</td>
                  <td>{question.marks}</td>
                  <td>{question.imageKey ?? '-'}</td>
                </tr>
              ))}
              {recentQuestions.length === 0 && (
                <tr>
                  <td colSpan={5}>No questions added in this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
