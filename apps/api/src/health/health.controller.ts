import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Liveness check that also verifies the database connection. */
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
