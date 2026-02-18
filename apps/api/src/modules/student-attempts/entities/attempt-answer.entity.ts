import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity({ schema: 'crm', name: 'attempt_answers' })
export class AttemptAnswer {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'attempt_answer_id'
  })
  attemptAnswerId!: string;

  @Column({ name: 'attempt_id', type: 'bigint' })
  attemptId!: string;

  @Column({ name: 'exam_id', type: 'bigint' })
  examId!: string;

  @Column({ name: 'question_id', type: 'bigint' })
  questionId!: string;

  @Column({ name: 'selected_option_id', type: 'bigint', nullable: true })
  selectedOptionId!: string | null;

  @Column({ name: 'answered_at', type: 'timestamptz', nullable: true })
  answeredAt!: Date | null;

  @Column({ name: 'is_marked_for_review', type: 'boolean', default: false })
  isMarkedForReview!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
