import { IsInt, IsOptional, Min } from 'class-validator';

export class SubmitAttemptDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentSeconds?: number;
}
