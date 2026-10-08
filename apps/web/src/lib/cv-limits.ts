/**
 * The limits of a CV document, as the API enforces them. They are repeated
 * here only to stop a user early, in the field; the API is what decides.
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

export const SOURCE_LIMITS = {
  targetRole: 120,
  text: 30_000,
  pdfBytes: 5 * 1024 * 1024,
  answer: 1000,
} as const;

export const PASSWORD_MIN_LENGTH = 8;
