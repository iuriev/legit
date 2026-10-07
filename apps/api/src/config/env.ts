import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Matches, Max, Min, validateSync } from 'class-validator';

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
