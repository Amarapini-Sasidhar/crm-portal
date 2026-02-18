import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity({ schema: 'crm', name: 'question_options' })
export class QuestionOption {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'option_id'
  })
  optionId!: string;

  @Column({ name: 'question_id', type: 'bigint' })
  questionId!: string;

  @Column({ name: 'option_key', type: 'char', length: 1 })
  optionKey!: string;

  @Column({ name: 'option_text', type: 'text' })
  optionText!: string;

  @Column({ name: 'is_correct', type: 'boolean', default: false })
  isCorrect!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
