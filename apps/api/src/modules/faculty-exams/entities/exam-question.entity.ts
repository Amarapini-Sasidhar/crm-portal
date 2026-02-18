import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value)
};

@Entity({ schema: 'crm', name: 'exam_questions' })
export class ExamQuestion {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'question_id'
  })
  questionId!: string;

  @Column({ name: 'exam_id', type: 'bigint' })
  examId!: string;

  @Column({ name: 'question_text', type: 'text' })
  questionText!: string;

  @Column({ name: 'image_key', type: 'text', nullable: true })
  imageKey!: string | null;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 1,
    transformer: numericTransformer
  })
  marks!: number;

  @Column({ name: 'display_order', type: 'integer' })
  displayOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
