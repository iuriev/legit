import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const TARGET_ROLE_MAX_LENGTH = 120;
export const SOURCE_TEXT_MAX_LENGTH = 30_000;
export const SOURCE_PDF_MAX_BYTES = 5 * 1024 * 1024;

/** Also drops the NUL character, which PostgreSQL cannot store and no CV needs. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replaceAll('\u0000', '').trim() : value;

/**
 * A text field left empty means that the source is the file. A browser sends
 * a line break of a form field as two characters; it counts as one here, as
 * it does in the field's own counter.
 */
const trimOrAbsent = ({ value }: { value: unknown }): unknown => {
  const trimmed = trim({ value });
  if (typeof trimmed !== 'string') {
    return trimmed;
  }
  return trimmed === '' ? undefined : trimmed.replaceAll('\r\n', '\n');
};

/** The text fields of the multipart request of `POST /api/cvs`. The PDF arrives as the file `file`. */
export class CreateCvDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(TARGET_ROLE_MAX_LENGTH)
  targetRole!: string;

  @Transform(trimOrAbsent)
  @IsOptional()
  @IsString()
  @MaxLength(SOURCE_TEXT_MAX_LENGTH)
  text?: string;
}
