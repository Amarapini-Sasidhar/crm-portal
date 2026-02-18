import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateBatchDto {
  @IsString()
  courseId!: string;

  @IsString()
  facultyId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
