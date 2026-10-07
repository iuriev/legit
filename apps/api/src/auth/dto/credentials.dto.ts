import type { CredentialsRequest } from '@cv-builder/contracts';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
/** Bounds the work of a sign-in request; no stored password is this long. */
export const LOGIN_PASSWORD_MAX_LENGTH = 1024;

/**
 * bcrypt reads only the first 72 bytes of its input. A longer password would
 * be silently truncated, so it is rejected instead; the limit is in bytes
 * because a character may take more than one.
 */
function MaxBytes(max: number, options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'maxBytes',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} is too long: it may take at most ${String(max)} bytes, which is fewer characters when they are not Latin`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && Buffer.byteLength(value) <= max,
      },
    });
  };
}

/** The one spelling of an email: what is stored, looked up and rate-limited. */
export const normalizeEmail = (email: string): string =>
  email.normalize('NFC').trim().toLowerCase();

const normalizeEmailField = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;

/**
 * Sign-in does not repeat the registration rules, so that an old or odd
 * password gets a plain "invalid credentials"; it only bounds the size.
 */
export class LoginDto implements CredentialsRequest {
  @Transform(normalizeEmailField)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(LOGIN_PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RegisterDto implements CredentialsRequest {
  @Transform(normalizeEmailField)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @MaxBytes(PASSWORD_MAX_LENGTH)
  password!: string;
}
