import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LlmClient } from './llm.client';
import { LLM_OPTIONS, llmOptionsFromConfig } from './llm-options';

@Module({
  providers: [
    { provide: LLM_OPTIONS, inject: [ConfigService], useFactory: llmOptionsFromConfig },
    LlmClient,
  ],
  exports: [LlmClient],
})
export class LlmModule {}
