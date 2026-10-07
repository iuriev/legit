import type { CvDocument } from '@cv-builder/contracts';

import { CV_LIMITS, cvDocumentSchema, describeIssues, emptyCvDocument } from './cv-document.schema';

const filled = (): CvDocument => ({
  contact: {
    fullName: 'Olena Šimić',
    email: 'olena@example.com',
    phone: '+380 50 123 45 67',
    location: 'Kyiv',
    links: ['https://github.com/olena'],
  },
  summary: 'Backend engineer.',
  experience: [
    {
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: 'March 2019',
      endDate: 'June 2022',
      bullets: ['Built the billing service'],
    },
  ],
  education: [
    { institution: 'KPI', degree: 'BSc', startDate: '2012', endDate: '2016', details: '' },
  ],
  skills: ['Node.js'],
});

describe('cvDocumentSchema', () => {
  it('accepts a filled document and an empty one', () => {
    expect(cvDocumentSchema.safeParse(filled()).success).toBe(true);
    expect(cvDocumentSchema.safeParse(emptyCvDocument()).success).toBe(true);
  });

  it('accepts every field at exactly its limit', () => {
    const document = filled();
    document.summary = 'a'.repeat(CV_LIMITS.summary);
    document.contact.fullName = 'a'.repeat(CV_LIMITS.shortText);
    document.skills = Array.from({ length: CV_LIMITS.skills }, () => 'a'.repeat(CV_LIMITS.skill));

    expect(cvDocumentSchema.safeParse(document).success).toBe(true);
  });

  it.each<[string, (document: CvDocument) => void, string]>([
    ['a summary', (d) => (d.summary = 'a'.repeat(CV_LIMITS.summary + 1)), 'summary'],
    [
      'a name',
      (d) => (d.contact.fullName = 'a'.repeat(CV_LIMITS.shortText + 1)),
      'contact.fullName',
    ],
    [
      'a bullet point',
      (d) => d.experience[0]?.bullets.push('a'.repeat(CV_LIMITS.bullet + 1)),
      'experience.0.bullets.1',
    ],
    ['a skill', (d) => d.skills.push('a'.repeat(CV_LIMITS.skill + 1)), 'skills.1'],
    ['a link', (d) => d.contact.links.push('a'.repeat(CV_LIMITS.link + 1)), 'contact.links.1'],
    [
      'education details',
      (d) => Object.assign(d.education[0] ?? {}, { details: 'a'.repeat(CV_LIMITS.details + 1) }),
      'education.0.details',
    ],
  ])('rejects %s over its length limit and names the field', (_name, change, path) => {
    const document = filled();
    change(document);

    const result = cvDocumentSchema.safeParse(document);

    const issues = result.success ? [] : describeIssues(result.error);
    expect(issues.join()).toContain(`${path}:`);
  });

  it('rejects more entries than allowed', () => {
    const tooManySkills = { ...filled(), skills: Array<string>(CV_LIMITS.skills + 1).fill('x') };
    const tooManyJobs = {
      ...filled(),
      experience: Array.from({ length: CV_LIMITS.experience + 1 }, () => filled().experience[0]),
    };

    expect(cvDocumentSchema.safeParse(tooManySkills).success).toBe(false);
    expect(cvDocumentSchema.safeParse(tooManyJobs).success).toBe(false);
  });

  it.each<[string, (document: CvDocument) => void]>([
    ['links', (d) => (d.contact.links = Array<string>(CV_LIMITS.links + 1).fill('x'))],
    [
      'bullet points of one job',
      (d) =>
        Object.assign(d.experience[0] ?? {}, {
          bullets: Array<string>(CV_LIMITS.bullets + 1).fill('x'),
        }),
    ],
    [
      'education entries',
      (d) =>
        (d.education = Array.from({ length: CV_LIMITS.education + 1 }, () => ({
          institution: 'KPI',
          degree: 'BSc',
          startDate: '',
          endDate: '',
          details: '',
        }))),
    ],
  ])('rejects more %s than allowed', (_name, change) => {
    const document = filled();
    change(document);

    expect(cvDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects the NUL character, which the database cannot store, in any text field', () => {
    const inSummary = { ...filled(), summary: 'abc\u0000def' };
    const inSkill = { ...filled(), skills: ['Node\u0000.js'] };

    expect(cvDocumentSchema.safeParse(inSummary).success).toBe(false);
    expect(cvDocumentSchema.safeParse(inSkill).success).toBe(false);
  });

  it('rejects a missing section, a wrong type and an unknown key', () => {
    const withoutSkills: Partial<CvDocument> = filled();
    delete withoutSkills.skills;
    const wrongType = { ...filled(), summary: 42 };
    const unknownKey = { ...filled(), hobbies: ['chess'] };
    const nestedUnknownKey = { ...filled(), contact: { ...filled().contact, age: 30 } };

    expect(cvDocumentSchema.safeParse(withoutSkills).success).toBe(false);
    expect(cvDocumentSchema.safeParse(wrongType).success).toBe(false);
    expect(cvDocumentSchema.safeParse(unknownKey).success).toBe(false);
    expect(cvDocumentSchema.safeParse(nestedUnknownKey).success).toBe(false);
  });

  it('keeps markup as the literal characters', () => {
    const document = { ...filled(), summary: '<script>alert(1)</script> & <b>bold</b>' };

    const result = cvDocumentSchema.parse(document);

    expect(result.summary).toBe('<script>alert(1)</script> & <b>bold</b>');
  });
});
