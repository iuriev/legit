import type { CvSection } from '@cv-builder/contracts';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type QuestionStatus = 'open' | 'answered' | 'skipped';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cv_id', type: 'uuid' })
  cvId!: string;

  @Column({ type: 'int' })
  position!: number;

  @Column({ type: 'text' })
  section!: CvSection;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'text' })
  status!: QuestionStatus;

  @Column({ type: 'text', nullable: true })
  answer!: string | null;
}
