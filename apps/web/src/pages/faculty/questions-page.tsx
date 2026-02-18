import { FormEvent, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';

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

export function FacultyQuestionsPage() {
  const [questionForm, setQuestionForm] = useState({
    examId: '',
    questionText: '',
    imageKey: '',
    marks: '1',
    options: {
      A: '',
      B: '',
      C: '',
      D: ''
    },
    correct: 'A' as OptionKey
  });
  const [lastImage, setLastImage] = useState<QuestionImageUploadResponse | null>(null);
  const [recentQuestions, setRecentQuestions] = useState<QuestionResponse[]>([]);

  const uploadTask = useApiTask();
  const questionTask = useApiTask();

  async function onUploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await uploadTask.run(
      () =>
        apiRequest<QuestionImageUploadResponse>(endpoints.faculty.uploadQuestionImage, {
          method: 'POST',
          body: formData
        }),
      'Image uploaded successfully.'
    );

    if (!response) {
      return;
    }

    setLastImage(response);
    setQuestionForm((previous) => ({
      ...previous,
      imageKey: response.imageKey
    }));
    event.currentTarget.reset();
  }

  async function onAddQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const options = (['A', 'B', 'C', 'D'] as OptionKey[]).map((optionKey) => ({
      optionKey,
      optionText: questionForm.options[optionKey],
      isCorrect: optionKey === questionForm.correct
    }));

    const response = await questionTask.run(
      () =>
        apiRequest<QuestionResponse>(endpoints.faculty.addQuestion(questionForm.examId), {
          method: 'POST',
          body: {
            questionText: questionForm.questionText,
            imageKey: questionForm.imageKey || undefined,
            marks: Number(questionForm.marks),
            options
          }
        }),
      'Question added successfully.'
    );

    if (!response) {
      return;
    }

    setRecentQuestions((previous) => [response, ...previous]);
    setQuestionForm((previous) => ({
      ...previous,
      questionText: '',
      marks: '1',
      options: {
        A: '',
        B: '',
        C: '',
        D: ''
      },
      correct: 'A'
    }));
  }

  return (
    <div className="page-grid">
      <Panel subtitle="Upload question image and use returned imageKey while adding MCQ." title="Upload Image">
        <form className="inline-form" onSubmit={onUploadImage}>
          <input accept="image/png,image/jpeg,image/webp" name="file" required type="file" />
          <button className="btn" disabled={uploadTask.loading} type="submit">
            {uploadTask.loading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
        {uploadTask.error && <ErrorMessage message={uploadTask.error} />}
        {uploadTask.success && <SuccessMessage message={uploadTask.success} />}
        {lastImage && (
          <div className="message-block">
            <p>imageKey: {lastImage.imageKey}</p>
            <p className="tiny muted">URL: {lastImage.imageUrl}</p>
          </div>
        )}
      </Panel>

      <Panel subtitle="Create MCQ questions for an existing exam." title="Add Question">
        <HintMessage message="Use an exam ID created from the Exams menu." />
        <form className="stack-form" onSubmit={onAddQuestion}>
          <div className="field-grid two">
            <label className="field">
              <span>Exam ID</span>
              <input
                onChange={(event) => setQuestionForm({ ...questionForm, examId: event.target.value })}
                required
                value={questionForm.examId}
              />
            </label>
            <label className="field">
              <span>Marks</span>
              <input
                min={0.01}
                onChange={(event) => setQuestionForm({ ...questionForm, marks: event.target.value })}
                required
                step="0.01"
                type="number"
                value={questionForm.marks}
              />
            </label>
          </div>

          <label className="field">
            <span>Question Text</span>
            <textarea
              onChange={(event) =>
                setQuestionForm({ ...questionForm, questionText: event.target.value })
              }
              required
              rows={3}
              value={questionForm.questionText}
            />
          </label>

          <label className="field">
            <span>Image Key (optional)</span>
            <input
              onChange={(event) => setQuestionForm({ ...questionForm, imageKey: event.target.value })}
              placeholder="question-images/..."
              value={questionForm.imageKey}
            />
          </label>

          <div className="field-grid two">
            {(['A', 'B', 'C', 'D'] as OptionKey[]).map((key) => (
              <label className="field" key={key}>
                <span>Option {key}</span>
                <input
                  onChange={(event) =>
                    setQuestionForm({
                      ...questionForm,
                      options: {
                        ...questionForm.options,
                        [key]: event.target.value
                      }
                    })
                  }
                  required
                  value={questionForm.options[key]}
                />
              </label>
            ))}
          </div>

          <label className="field">
            <span>Correct Option</span>
            <select
              onChange={(event) =>
                setQuestionForm({ ...questionForm, correct: event.target.value as OptionKey })
              }
              value={questionForm.correct}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </label>

          {questionTask.error && <ErrorMessage message={questionTask.error} />}
          {questionTask.success && <SuccessMessage message={questionTask.success} />}

          <button className="btn" disabled={questionTask.loading} type="submit">
            {questionTask.loading ? 'Adding...' : 'Add Question'}
          </button>
        </form>
      </Panel>

      <Panel subtitle="Questions added in this session." title="Recent Questions">
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
