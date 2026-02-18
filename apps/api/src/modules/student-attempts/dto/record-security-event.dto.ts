import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { SecurityEventType } from '../../../common/enums/security-event-type.enum';

export class RecordSecurityEventDto {
  @IsEnum(SecurityEventType)
  eventType!: SecurityEventType;

  @IsOptional()
  @IsInt()
  @Min(0)
  riskScore?: number;

  @IsOptional()
  @IsObject()
  eventData?: Record<string, unknown>;
}
