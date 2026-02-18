import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class QuestionOptionDto {
  @IsIn(['A', 'B', 'C', 'D'])
  optionKey!: 'A' | 'B' | 'C' | 'D';

  @IsString()
  @MaxLength(500)
  optionText!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class AddQuestionDto {
  @IsString()
  @MaxLength(4000)
  questionText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageKey?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  marks!: number;

  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];
}
