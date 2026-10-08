import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { ComposeStage } from './compose.stage';
import { ExtractStage } from './extract.stage';

@Module({
  imports: [LlmModule],
  providers: [ExtractStage, ComposeStage],
  exports: [ExtractStage, ComposeStage],
})
export class GenerationModule {}
