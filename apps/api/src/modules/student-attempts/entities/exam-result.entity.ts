import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn
} from 'typeorm';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value)
};

@Entity({ schema: 'crm', name: 'exam_results' })
export class ExamResult {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'result_id'
  })
  resultId!: string;

  @Column({ name: 'attempt_id', type: 'bigint', unique: true })
  attemptId!: string;

  @Column({ name: 'exam_id', type: 'bigint' })
  examId!: string;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId!: string;

  @Column({ name: 'total_questions', type: 'integer' })
  totalQuestions!: number;

  @Column({ name: 'correct_answers', type: 'integer' })
  correctAnswers!: number;

  @Column({ name: 'wrong_answers', type: 'integer' })
  wrongAnswers!: number;

  @Column({ type: 'integer' })
  unanswered!: number;

  @Column({
    name: 'max_marks',
    type: 'numeric',
    precision: 8,
    scale: 2,
    transformer: numericTransformer
  })
  maxMarks!: number;

  @Column({
    name: 'marks_obtained',
    type: 'numeric',
    precision: 8,
    scale: 2,
    transformer: numericTransformer
  })
  marksObtained!: number;

  @Column({
    name: 'score_percentage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
    insert: false,
    update: false
  })
  scorePercentage!: number;

  @Column({
    type: 'boolean',
    insert: false,
    update: false
  })
  passed!: boolean;

  @Column({ name: 'evaluated_at', type: 'timestamptz' })
  evaluatedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
