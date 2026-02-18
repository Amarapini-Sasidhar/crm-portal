import { IsString } from 'class-validator';

export class EnrollStudentDto {
  @IsString()
  batchId!: string;
}
