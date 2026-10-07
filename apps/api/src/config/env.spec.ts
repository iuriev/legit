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
});
