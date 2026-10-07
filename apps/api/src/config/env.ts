import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Environment variables the API needs. Validated once at startup so that a
 * missing or malformed value stops the process instead of failing later.
 */
export class Env {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL must be a postgres:// URL' })
  DATABASE_URL!: string;

  /** bcrypt cost factor. Lowered only in tests, where hashing speed does not matter. */
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_ROUNDS = 12;

  /**
   * Express `trust proxy` setting, for example `loopback` or `uniquelocal`: the
   * peers whose X-Forwarded-For and X-Forwarded-Proto are believed. Set it to
   * the network the web server calls from; leave it unset when clients reach
   * the API directly. A hop count or a boolean is refused: the value reaches
   * Express as text, where `1` and `true` would not mean what they say.
   */
  @IsOptional()
  @IsString()
  @Matches(/^(?!\d+$)(?!true$)(?!false$).+/, {
    message:
      'TRUST_PROXY must be a name such as loopback or a list of addresses, not a number or a boolean',
  })
  TRUST_PROXY?: string;

  /**
   * Registration and sign-in requests allowed per minute for one email from one
   * client. A client as a whole may send ten times as many.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT_PER_MINUTE = 10;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors.flatMap((error) => Object.values(error.constraints ?? {})).join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return env;
}
