import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Public } from '../auth/public.decorator';

/** Liveness check that also verifies the database connection. */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
