import { IsOptional, IsString } from 'class-validator';

export class EnrollStudentDto {
  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;
}
