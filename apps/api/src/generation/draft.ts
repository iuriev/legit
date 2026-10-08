import { z } from 'zod';

/** The numbers of the facts an item rests on. */
const facts = z.array(z.number().int());

const cited = z.object({ value: z.string(), facts });

/**
 * What the writer returns: the CV with, for every item, the facts it rests
 * on. The schema is loose on purpose. Lengths, counts and above all the
 * references are judged by `checkDraft`, which can leave out one bad item
 * instead of rejecting the whole draft.
 */
export const draftSchema = z.object({
  contact: z.object({
    fullName: cited,
    email: cited,
    phone: cited,
    location: cited,
    links: z.array(cited),
  }),
  summary: z.object({ text: z.string(), facts }),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      /** The facts the five fields above rest on. */
      facts,
      bullets: z.array(z.object({ text: z.string(), facts })),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      details: z.string(),
      facts,
    }),
  ),
  skills: z.array(z.object({ name: z.string(), facts })),
});

export type CvDraft = z.infer<typeof draftSchema>;
