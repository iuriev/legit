import type { CvDocument, CvFailureCode, CvStage, CvState } from '@cv-builder/contracts';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cvs')
export class Cv {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'target_role', type: 'text' })
  targetRole!: string;

  @Column({ type: 'text' })
  state!: CvState;

  @Column({ type: 'text', nullable: true })
  stage!: CvStage | null;

  @Column({ name: 'failure_code', type: 'text', nullable: true })
  failureCode!: CvFailureCode | null;

  @Column({ type: 'jsonb', nullable: true })
  document!: CvDocument | null;

  @Column({ name: 'omitted_count', type: 'int' })
  omittedCount!: number;

  @Column({ type: 'int' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Set by the statements that change the CV, not by the ORM. */
  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
