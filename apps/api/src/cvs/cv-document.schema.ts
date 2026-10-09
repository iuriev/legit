import type { CvDocument } from '@cv-builder/contracts';
import { z } from 'zod';

/**
 * Limits of a CV document. They bound what the model may return and what a
 * user may save, and keep the PDF to a sensible size.
 */
export const CV_LIMITS = {
  shortText: 200,
  link: 300,
  summary: 2000,
  bullet: 500,
  details: 1000,
  skill: 80,
  links: 10,
  experience: 30,
  bullets: 20,
  education: 15,
  skills: 60,
} as const;

/**
 * A text field of at most `max` characters. PostgreSQL cannot store the NUL
 * character or half of a surrogate pair in JSON, so both are refused here
 * rather than failing there.
 */
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes('\u0000'), 'must not contain the NUL character')
    .refine((value) => value.isWellFormed(), 'must be well-formed text');

const shortText = text(CV_LIMITS.shortText);

/**
 * The one definition of a valid CV document. It is applied to every write,
 * whether the writer is the model or the user. Unknown keys are refused.
 */
export const cvDocumentSchema: z.ZodType<CvDocument> = z.strictObject({
  contact: z.strictObject({
    fullName: shortText,
    email: shortText,
    phone: shortText,
    location: shortText,
    links: z.array(text(CV_LIMITS.link)).max(CV_LIMITS.links),
  }),
  summary: text(CV_LIMITS.summary),
  experience: z
    .array(
      z.strictObject({
        company: shortText,
        title: shortText,
        location: shortText,
        startDate: shortText,
        endDate: shortText,
        bullets: z.array(text(CV_LIMITS.bullet)).max(CV_LIMITS.bullets),
      }),
    )
    .max(CV_LIMITS.experience),
  education: z
    .array(
      z.strictObject({
        institution: shortText,
        degree: shortText,
        startDate: shortText,
        endDate: shortText,
        details: text(CV_LIMITS.details),
      }),
    )
    .max(CV_LIMITS.education),
  skills: z.array(text(CV_LIMITS.skill)).max(CV_LIMITS.skills),
});

export function emptyCvDocument(): CvDocument {
  return {
    contact: { fullName: '', email: '', phone: '', location: '', links: [] },
    summary: '',
    experience: [],
    education: [],
    skills: [],
  };
}

/** How many problems of a document are reported. A hostile body can have hundreds of thousands. */
const MAX_REPORTED_ISSUES = 20;

/** Validation messages that name the field, such as `experience.0.bullets.3: Too big…`. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`);
}
