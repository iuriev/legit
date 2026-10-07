import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** `extract` reads the source and asks questions; `compose` writes and checks the CV. */
export type JobKind = 'extract' | 'compose';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

@Entity('generation_jobs')
export class GenerationJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cv_id', type: 'uuid' })
  cvId!: string;

  @Column({ type: 'text' })
  kind!: JobKind;

  @Column({ type: 'text' })
  status!: JobStatus;

  /** How many times the job has been claimed. */
  @Column({ type: 'int' })
  attempts!: number;

  @Column({ name: 'run_after', type: 'timestamptz' })
  runAfter!: Date;

  /** While running: when the claim lapses and another worker may take the job. */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  /** For diagnosis only; never shown to the user. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
