import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const TARGET_ROLE_MAX_LENGTH = 120;
export const SOURCE_TEXT_MAX_LENGTH = 30_000;
export const SOURCE_PDF_MAX_BYTES = 5 * 1024 * 1024;

/** Also drops the NUL character, which PostgreSQL cannot store and no CV needs. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replaceAll('\u0000', '').trim() : value;

/** A text field left empty means that the source is the file. */
const trimOrAbsent = ({ value }: { value: unknown }): unknown => {
  const trimmed = trim({ value });
  return trimmed === '' ? undefined : trimmed;
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
