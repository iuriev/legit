import type { CvDocument, CvEducation, CvExperience } from '@cv-builder/contracts';

import { CV_LIMITS } from '../../lib/cv-limits';

export const emptyExperience = (): CvExperience => ({
  company: '',
  title: '',
  location: '',
  startDate: '',
  endDate: '',
  bullets: [''],
});

export const emptyEducation = (): CvEducation => ({
  institution: '',
  degree: '',
  startDate: '',
  endDate: '',
  details: '',
});

const filled = (items: string[]): string[] =>
  items.map((item) => item.trim()).filter((item) => item !== '');

/**
 * The document as it is saved: text trimmed, empty list items and entirely
 * empty entries removed. The editor keeps those while the user types (a new,
 * still empty bullet point is one); this is what is sent and compared.
 */
export function tidy(document: CvDocument): CvDocument {
  const experience = document.experience
    .map((entry) => ({
      company: entry.company.trim(),
      title: entry.title.trim(),
      location: entry.location.trim(),
      startDate: entry.startDate.trim(),
      endDate: entry.endDate.trim(),
      bullets: filled(entry.bullets),
    }))
    .filter(
      ({ bullets, ...fields }) => bullets.length > 0 || filled(Object.values(fields)).length > 0,
    );
  const education = document.education
    .map((entry) => ({
      institution: entry.institution.trim(),
      degree: entry.degree.trim(),
      startDate: entry.startDate.trim(),
      endDate: entry.endDate.trim(),
      details: entry.details.trim(),
    }))
    .filter((entry) => filled(Object.values(entry)).length > 0);
  return {
    contact: {
      fullName: document.contact.fullName.trim(),
      email: document.contact.email.trim(),
      phone: document.contact.phone.trim(),
      location: document.contact.location.trim(),
      links: filled(document.contact.links),
    },
    summary: document.summary.trim(),
    experience,
    education,
    skills: filled(document.skills),
  };
}

export const sameDocument = (a: CvDocument, b: CvDocument): boolean =>
  JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));

/**
 * Problems of the two fields that are lists typed as lines, which the browser
 * cannot check by itself. The API checks them again.
 */
export function listProblems(document: CvDocument): { links?: string; skills?: string } {
  const problem = (items: string[], name: string, maxItems: number, maxLength: number) => {
    if (items.length > maxItems) {
      return `At most ${String(maxItems)} ${name}s.`;
    }
    const long = items.find((item) => item.length > maxLength);
    return long ? `A ${name} may be at most ${String(maxLength)} characters.` : undefined;
  };
  return {
    links: problem(document.contact.links, 'link', CV_LIMITS.links, CV_LIMITS.link),
    skills: problem(document.skills, 'skill', CV_LIMITS.skills, CV_LIMITS.skill),
  };
}
