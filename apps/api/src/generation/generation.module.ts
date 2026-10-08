import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { ExtractStage } from './extract.stage';

@Module({
  imports: [LlmModule],
  providers: [ExtractStage],
  exports: [ExtractStage],
})
export class GenerationModule {}
