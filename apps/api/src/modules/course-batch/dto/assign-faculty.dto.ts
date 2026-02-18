import { IsString } from 'class-validator';

export class AssignFacultyDto {
  @IsString()
  facultyId!: string;
}
