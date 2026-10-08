import type { CvSection } from '@cv-builder/contracts';
import { z } from 'zod';

import { toPlainLine } from '../common/text';

export const MAX_QUESTIONS = 8;
export const MAX_QUESTION_LENGTH = 300;

const SECTIONS = ['contact', 'summary', 'experience', 'education', 'skills'] as const;

/** What the model is asked to return. Kept loose: `cleanQuestions` applies the limits. */
export const questionsSchema = z.object({
  questions: z.array(z.object({ section: z.string(), text: z.string() })),
});

export interface DraftQuestion {
  section: string;
  text: string;
}

export interface CleanQuestion {
  section: CvSection;
  text: string;
}

const isSection = (value: string): value is CvSection =>
  (SECTIONS as readonly string[]).includes(value);

/** A question is plain words. One that carries a link is not something we show the user. */
const LINK = /https?:\/\/|www\./i;

/**
 * Applies the limits to the questions the model returned: at most eight, each
 * for one of the five sections, of a sensible length, in plain words, no
 * blanks and no repeats. An extra or unusable question is dropped rather than
 * failing the stage: asking fewer is harmless, and failing would throw away
 * the reading that was just paid for.
 */
export function cleanQuestions(questions: DraftQuestion[]): CleanQuestion[] {
  const seen = new Set<string>();
  const cleaned: CleanQuestion[] = [];
  for (const question of questions) {
    const text = toPlainLine(question.text);
    const key = text.toLowerCase();
    if (
      !isSection(question.section) ||
      text === '' ||
      text.length > MAX_QUESTION_LENGTH ||
      LINK.test(text) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    cleaned.push({ section: question.section, text });
    if (cleaned.length === MAX_QUESTIONS) {
      break;
    }
  }
  return cleaned;
}
