import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator';

class AttemptAnswerPayloadDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @IsOptional()
  @IsBoolean()
  isMarkedForReview?: boolean;
}

export class SaveAttemptAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerPayloadDto)
  answers!: AttemptAnswerPayloadDto[];
}
