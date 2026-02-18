import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn
} from 'typeorm';
import { SecurityEventType } from '../../../common/enums/security-event-type.enum';

@Entity({ schema: 'crm', name: 'attempt_security_events' })
export class AttemptSecurityEvent {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'event_id'
  })
  eventId!: string;

  @Column({ name: 'attempt_id', type: 'bigint' })
  attemptId!: string;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: SecurityEventType,
    enumName: 'security_event_type'
  })
  eventType!: SecurityEventType;

  @Column({ name: 'event_data', type: 'jsonb', nullable: true })
  eventData!: Record<string, unknown> | null;

  @Column({ name: 'risk_score', type: 'smallint', default: 0 })
  riskScore!: number;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
