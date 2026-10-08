import type { SubmitAnswersRequest, SubmittedAnswer } from '@cv-builder/contracts';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { toPlainLine } from '../../common/text';
import { MAX_QUESTIONS } from '../../generation/questions';

export const ANSWER_MAX_LENGTH = 1000;

/** An answer becomes one plain line, like every other fact. One left blank is a skip. */
const blankToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value ?? null;
  }
  const line = toPlainLine(value);
  return line === '' ? null : line;
};

export class AnswerDto implements SubmittedAnswer {
  @IsUUID()
  questionId!: string;

  @Transform(blankToNull)
  @IsOptional()
  @IsString()
  @MaxLength(ANSWER_MAX_LENGTH)
  answer!: string | null;
}

export class SubmitAnswersDto implements SubmitAnswersRequest {
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}
