const PG_UNIQUE_VIOLATION = '23505';

/** Whether an error thrown by a query is PostgreSQL refusing a duplicate. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  // TypeORM wraps the driver's error and keeps it as `driverError`.
  const driverError = 'driverError' in error ? error.driverError : error;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === PG_UNIQUE_VIOLATION
  );
}
