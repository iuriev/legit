import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
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

  /**
   * The only secret. Without it the API starts and every generation fails with
   * the reason "not configured", which is easier to diagnose than a crash loop.
   */
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  /** Every model call uses this model. */
  @IsString()
  @MinLength(1)
  ANTHROPIC_MODEL = 'claude-sonnet-5-5';

  /** Points the SDK at another address, such as a stub of the API in a test setup. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  ANTHROPIC_BASE_URL?: string;

  /**
   * How long one request to the model service may take. A stage makes up to
   * three in a row, and together they must fit into WORKER_LEASE_SECONDS.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  LLM_TIMEOUT_MS = 180_000;

  /** The largest source the reading stage sends to the model, in input tokens. */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  LLM_INPUT_TOKEN_BUDGET = 40_000;

  /** How often the worker looks for a waiting generation job. */
  @Type(() => Number)
  @IsInt()
  @Min(10)
  WORKER_POLL_INTERVAL_MS = 1000;

  /**
   * How long a claimed job is left alone before another worker may take it.
   * It must exceed the worst case of one attempt, or a slow attempt runs twice.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  WORKER_LEASE_SECONDS = 600;

  /** How many jobs one API process runs at the same time. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  WORKER_CONCURRENCY = 3;

  /**
   * Waits before the second and later attempts of a job, in milliseconds,
   * separated by commas. A job gets one more attempt than there are waits.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '')
          .map(Number)
      : value,
  )
  @IsInt({ each: true })
  @Min(0, { each: true })
  @ArrayMaxSize(10)
  WORKER_RETRY_DELAYS_MS: number[] = [5000, 30000];

  /** How long a stopping worker waits for running jobs before handing them back. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  WORKER_SHUTDOWN_GRACE_MS = 5000;
}

/** The most requests one stage sends to the model service: a token count and two messages. */
const REQUESTS_PER_STAGE = 3;

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors.flatMap((error) => Object.values(error.constraints ?? {})).join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  // A stage that outlives its lease is claimed by a second worker while the
  // first is still running it.
  if (REQUESTS_PER_STAGE * env.LLM_TIMEOUT_MS >= env.WORKER_LEASE_SECONDS * 1000) {
    throw new Error(
      `Invalid environment: WORKER_LEASE_SECONDS must exceed ${String(REQUESTS_PER_STAGE)} times LLM_TIMEOUT_MS`,
    );
  }
  return env;
}
