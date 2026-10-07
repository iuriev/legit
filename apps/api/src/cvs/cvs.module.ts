import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cv } from './cv.entity';
import { CvsController } from './cvs.controller';
import { CvsService } from './cvs.service';
import { Question } from './question.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cv, Question])],
  controllers: [CvsController],
  providers: [CvsService],
})
export class CvsModule {}
