import type { CvStage, CvState } from '@cv-builder/contracts';

export const STATE_LABELS: Record<CvState, string> = {
  generating: 'Generating…',
  awaiting_answers: 'Waiting for your answers',
  ready: 'Ready',
  failed: 'Failed',
};

/** The stages of a generation in order, as the owner reads them. */
export const STAGES: { stage: CvStage; label: string }[] = [
  { stage: 'reading', label: 'Reading your document' },
  { stage: 'questions', label: 'Preparing questions' },
  { stage: 'writing', label: 'Writing your CV' },
  { stage: 'checking', label: 'Checking it against the facts' },
];

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
