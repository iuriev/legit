import { NodeEnv, validateEnv } from './env';

describe('validateEnv', () => {
  const valid = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

  it('applies defaults and converts numeric strings', () => {
    const env = validateEnv({ ...valid, PORT: '4000' });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
  });

  it('rejects a missing database URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a database URL for another engine', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('accepts a named proxy network and refuses a hop count or a boolean', () => {
    expect(validateEnv({ ...valid, TRUST_PROXY: 'loopback' }).TRUST_PROXY).toBe('loopback');
    expect(validateEnv(valid).TRUST_PROXY).toBeUndefined();
    expect(() => validateEnv({ ...valid, TRUST_PROXY: '1' })).toThrow(/TRUST_PROXY/);
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('reads the waits between attempts from a comma-separated list', () => {
    expect(validateEnv(valid).WORKER_RETRY_DELAYS_MS).toEqual([5000, 30000]);
    expect(
      validateEnv({ ...valid, WORKER_RETRY_DELAYS_MS: '0, 10' }).WORKER_RETRY_DELAYS_MS,
    ).toEqual([0, 10]);
    expect(validateEnv({ ...valid, WORKER_RETRY_DELAYS_MS: '' }).WORKER_RETRY_DELAYS_MS).toEqual(
      [],
    );
    expect(() => validateEnv({ ...valid, WORKER_RETRY_DELAYS_MS: 'soon' })).toThrow(
      /WORKER_RETRY_DELAYS_MS/,
    );
  });

  it('treats an empty API key as no key', () => {
    expect(validateEnv({ ...valid, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(validateEnv({ ...valid, ANTHROPIC_API_KEY: 'sk-test' }).ANTHROPIC_API_KEY).toBe(
      'sk-test',
    );
  });

  it('requires the job lease to outlast the requests of one stage', () => {
    expect(() =>
      validateEnv({ ...valid, LLM_TIMEOUT_MS: '200000', WORKER_LEASE_SECONDS: '600' }),
    ).toThrow(/WORKER_LEASE_SECONDS/);
    expect(
      validateEnv({ ...valid, LLM_TIMEOUT_MS: '100000', WORKER_LEASE_SECONDS: '301' }),
    ).toBeDefined();
  });
});
