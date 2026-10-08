import type { CvDocument, CvEducation, CvExperience } from '@cv-builder/contracts';

import { toPlainLine } from '../common/text';
import { CV_LIMITS } from '../cvs/cv-document.schema';
import type { CvDraft } from './draft';

/** A fact as the checks see it: its number and its text, nothing the model wrote. */
export interface CheckableFact {
  ref: number;
  quote: string;
}

/** An item of the draft that did not pass, with the reason given back to the writer. */
export interface Rejection {
  /** Where the item is in the draft, such as `experience[0].bullets[2]`. */
  path: string;
  text: string;
  reason: string;
}

export interface CheckedDraft {
  /** The draft without its fact references and without everything that was rejected. */
  document: CvDocument;
  rejected: Rejection[];
}

/** How many facts one item may name. Naming all of them would make "the facts it names" mean "any fact". */
export const MAX_REFS = 8;
export const MAX_SUMMARY_REFS = 20;

// ---------------------------------------------------------------------------
// Preparing the texts
// ---------------------------------------------------------------------------

/** Characters that take no space: format characters and the fillers that render as nothing. */
const INVISIBLE = /[\p{Cf}\u115F\u1160\u3164\uFFA0]/gu;

/**
 * A text of the model as it is checked and, if it passes, stored: one plain
 * line without invisible characters. Nothing else about it is changed, so
 * what is stored is what was checked.
 */
export function cleanItemText(raw: string): string {
  return toPlainLine(raw.replace(INVISIBLE, ''));
}

/**
 * Whether a text states a number in a way the checks do not read: a digit that
 * is not one of 0–9 (full-width, superscript, a fraction sign, a digit of
 * another script), or a digit with a combining mark on it. Such an item is
 * rejected rather than interpreted. Converting it would change what the CV
 * says: "10⁶" would become "106".
 */
export function hasUnreadableNumber(text: string): boolean {
  for (const character of text) {
    if ((character.codePointAt(0) ?? 0) < 128) {
      continue;
    }
    if (/\p{N}/u.test(character) || /\d/.test(character.normalize('NFKC'))) {
      return true;
    }
  }
  return /\d\p{M}/u.test(text);
}

/**
 * A fact as the checks read its numbers. The fact is the user's own material
 * and is not changed where it is stored; here its digits are made readable. A
 * digit of a compatibility form (full-width) becomes that digit. A character
 * that only contains digits (a superscript, a fraction) is set apart by
 * spaces, so that "10⁶" supports 10 and 6 but never 106.
 */
export function readableFact(quote: string): string {
  let readable = '';
  for (const character of quote.replace(INVISIBLE, '')) {
    const folded = character.normalize('NFKC');
    if ((character.codePointAt(0) ?? 0) < 128 || !/\d/.test(folded)) {
      readable += character;
    } else {
      readable += /^\p{Nd}$/u.test(character) ? folded : ` ${folded} `;
    }
  }
  return readable;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** A run of digits, or digits grouped in threes by commas or spaces ("1,200", "1 200"). */
const NUMBER = /(?<!\d)(?:\d{1,3}(?:[, \u00a0\u202f]\d{3})+(?!\d)|\d+)/g;

/**
 * Digits joined by a separator that is not a thousands comma — "3.5", "40.6",
 * "12.03.2019", "1'200", "3,5", "1_200" — and a decimal that starts with its
 * point, ".5". The parts of such a number mean something only together.
 */
const JOINED_NUMBER = /(?<![\d.,'\u00B7\u066B_])(?:\d+|(?=[.]\d))(?:[.,'\u00B7\u066B_]\d+)+/g;
const COMMA_GROUPED = /^\d{1,3}(?:,\d{3})+$/;

const UNITS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const WORD_VALUES = new Map<string, number>([
  ['zero', 0],
  ...UNITS.map((word, index): [string, number] => [word, index + 1]),
  ...TEENS.map((word, index): [string, number] => [word, index + 10]),
  ...TENS.map((word, index): [string, number] => [word, (index + 2) * 10]),
]);

/**
 * "twenty-five" or "twenty five"; or a single number word, also as the start
 * of "eightfold". "one" on its own is left out: it is too often not a count.
 */
const NUMBER_WORD = new RegExp(
  `\\b(?:(${TENS.join('|')})[- ]?(${UNITS.join('|')})|(${['zero', ...UNITS.slice(1), ...TEENS, ...TENS].join('|')}))(?:fold)?\\b`,
  'gi',
);

/**
 * Words that state a quantity and are compared as words, each with the forms
 * it takes: "millions", "multimillion", "doubled", "centuries". The words of
 * magnitude are also read in the short forms a CV uses ("10k", "$2M") and in
 * Ukrainian and Russian, so that "200 тисяч" in a source supports "200
 * thousand" in the CV.
 */
const QUANTITY_WORDS: [name: string, pattern: RegExp][] = [
  ['dozen', /\bdozens?\b/i],
  ['hundred', /\b(?:multi-?)?hundreds?\b/i],
  [
    'thousand',
    /\b(?:multi-?)?thousands?\b|(?<![\p{L}\d])\d[\d.,]*k\b|(?<!\p{L})(?:тисяч\p{L}*|тис\.|тыс\p{L}*)/iu,
  ],
  [
    'million',
    /\b(?:multi-?)?millions?\b|(?<![\p{L}\d])\d[\d.,]*M\b|(?<!\p{L})(?:мільйон\p{L}*|миллион\p{L}*|млн)/u,
  ],
  [
    'billion',
    /\b(?:multi-?)?billions?\b|(?<![\p{L}\d])\d[\d.,]*B\b|(?<!\p{L})(?:мільярд\p{L}*|миллиард\p{L}*|млрд)/u,
  ],
  ['trillion', /\b(?:multi-?)?trillions?\b/i],
  ['decade', /\bdecades?\b/i],
  ['century', /\bcentur(?:y|ies)\b/i],
  ['half', /\b(?:half|halv(?:e|ed|es|ing))\b/i],
  ['twice', /\btwice\b/i],
  ['double', /\bdoubl(?:e|ed|es|ing)\b/i],
  ['triple', /\btripl(?:e|ed|es|ing)\b/i],
  ['quadruple', /\bquadrupl(?:e|ed|es|ing)\b/i],
];

/**
 * The quantities a text states, in a form that can be compared:
 *
 * - a run of digits, with thousands separators and leading zeros removed, so
 *   that "1,200", "1 200" and "1200" are one number, as are "03" and "3";
 * - an English number word as its value ("three" is 3, "twenty-five" is 25);
 * - a word of quantity ("million", "decade", "doubled") as that word.
 *
 * Digits inside a word count ("S3", "B2B"): a name with a digit must come from
 * the facts like any other number.
 */
export function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBER)) {
    found.add(match[0].replace(/\D/g, '').replace(/^0+(?=\d)/, ''));
  }
  for (const match of text.matchAll(NUMBER_WORD)) {
    const [, tens, unit, single] = match;
    const value = (word: string | undefined) => WORD_VALUES.get(word?.toLowerCase() ?? '') ?? 0;
    found.add(String(single ? value(single) : value(tens) + value(unit)));
  }
  for (const [name, pattern] of QUANTITY_WORDS) {
    if (pattern.test(text)) {
      found.add(name);
    }
  }
  return found;
}

/** The numbers of a text whose digits are joined and must be found joined: "3.5", ".5". */
export function joinedNumbersIn(text: string): string[] {
  return [...text.matchAll(JOINED_NUMBER)]
    .map((match) => match[0])
    .filter((token) => !COMMA_GROUPED.test(token));
}

/**
 * Why the numbers of an item are not supported by the given facts, or null.
 *
 * Every quantity in the item must be stated by the facts it names. A number
 * with joined digits must also occur there as written: "40.6" is not supported
 * by a 40 in one place and a 6 in another.
 */
function unsupportedNumber(text: string, quotes: string[]): string | null {
  // Each fact on its own line, so that the end of one and the start of the
  // next never read as one number.
  const facts = quotes.map(readableFact).join('\n');
  const supported = numbersIn(facts);
  const unsupported = [...numbersIn(text)].filter((number) => !supported.has(number));
  if (unsupported.length > 0) {
    return `The number ${unsupported.join(', ')} does not occur in the facts it names.`;
  }
  const joinedInFacts = new Set(joinedNumbersIn(facts));
  const loose = joinedNumbersIn(text).filter((token) => !joinedInFacts.has(token));
  if (loose.length > 0) {
    return `The number ${loose.join(', ')} does not occur in the facts it names.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Email addresses, links and phone numbers
// ---------------------------------------------------------------------------

/**
 * The words of a text as they stand between spaces, without the brackets,
 * quotes and punctuation around them. An address is compared with a whole
 * word of a fact, never searched for inside one, so a part of an address can
 * never count as the address.
 */
function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/^[<("'[{]+/, '').replace(/[>)"'\]}.,;:!?]+$/, ''))
    .filter((word) => word !== '');
}

/** A word that is a link wherever it stands: it has a scheme, starts with "www.", or is a host with a path. */
const looksLikeLink = (word: string): boolean =>
  word.includes('://') || /^www\./i.test(word) || /^[^/@]+\.[a-z]{2,}\/\S/i.test(word);

/** The shapes a contact value must have, whatever the facts say. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;
const LINK_SHAPE = /^(?:https?:\/\/)?[^\s/?#@:]+\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;
const PHONE_SHAPE = /^[+\d\s().-]+$/;
const PHONE_MIN_DIGITS = 7;

/** One address in two spellings: the scheme, a final slash and the case of the host do not matter. */
function canonicalLink(link: string): string {
  const withoutScheme = link.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const pathStart = withoutScheme.search(/[/?#]/);
  return pathStart === -1
    ? withoutScheme.toLowerCase()
    : withoutScheme.slice(0, pathStart).toLowerCase() + withoutScheme.slice(pathStart);
}

/**
 * Phone-like runs of a text: groups of digits with at most one space, dot or
 * hyphen between them, or a hyphen and a space where a line of a PDF broke. A
 * longer gap ends the run, so "… 4567. 5 years" and "2019 – 2022" are not
 * read as one number.
 */
const PHONE_RUN = /\+?\(?\d+\)?(?:(?:- |[ \u00a0.-])?\(?\d+\)?)*/g;
const digitsOfPhone = (phone: string): string => phone.replace(/[^\d+]/g, '');

type ExactKind = 'email' | 'phone' | 'link';

const KIND_NAMES: Record<ExactKind, string> = {
  email: 'email address',
  phone: 'phone number',
  link: 'link',
};

/**
 * Whether a value that must be exact is one of the values of that kind in the
 * given facts: the whole address or the whole number.
 */
function isExactCopy(kind: ExactKind, value: string, quotes: string[]): boolean {
  const facts = quotes.map((quote) => quote.replace(INVISIBLE, ''));
  // Compared the way the words of a fact are read: without closing brackets
  // or punctuation at the edges, which a fact's word loses as well.
  const [word, ...more] = wordsOf(value);
  switch (kind) {
    case 'email':
      return (
        EMAIL_SHAPE.test(value) &&
        word !== undefined &&
        more.length === 0 &&
        facts.some((fact) =>
          wordsOf(fact).some((factWord) => factWord.toLowerCase() === word.toLowerCase()),
        )
      );
    case 'link':
      return (
        LINK_SHAPE.test(value) &&
        word !== undefined &&
        more.length === 0 &&
        facts.some((fact) =>
          wordsOf(fact).some(
            (factWord) =>
              !factWord.includes('@') && canonicalLink(factWord) === canonicalLink(word),
          ),
        )
      );
    case 'phone': {
      const digits = digitsOfPhone(value);
      return (
        PHONE_SHAPE.test(value) &&
        digits.replace(/\D/g, '').length >= PHONE_MIN_DIGITS &&
        // The named facts are read as one text, in the order named: a PDF may
        // break a phone number across two lines, which are two facts.
        [...facts.map(readableFact).join(' ').matchAll(PHONE_RUN)].some(
          (run) => digitsOfPhone(run[0]) === digits,
        )
      );
    }
  }
}

/**
 * Why an address inside ordinary text is not supported, or null. A word with
 * an "@" in it, or a word that is recognisably a link, must be a word of a
 * fact the item names.
 */
function unsupportedAddress(text: string, quotes: string[]): string | null {
  for (const word of wordsOf(text)) {
    if (word.includes('@')) {
      const inFacts = quotes.some((quote) =>
        wordsOf(quote.replace(INVISIBLE, '')).some(
          (fact) => fact.toLowerCase() === word.toLowerCase(),
        ),
      );
      if (!inFacts) {
        return `The address ${word} is not copied exactly from a fact it names.`;
      }
    } else if (looksLikeLink(word) && !isExactCopy('link', word, quotes)) {
      return `The link ${word} is not copied exactly from a fact it names.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The check of one item, and of a whole draft
// ---------------------------------------------------------------------------

export interface ItemRules {
  /** For a contact value that must be exact. */
  exact?: ExactKind;
  maxLength?: number;
  maxRefs?: number;
}

/**
 * Decides whether one item of the draft may enter the CV, and returns the
 * reason when it may not. The rules, in order:
 *
 * 1. It names at least one fact, not too many, and every fact it names exists.
 * 2. It states no number in a form the checks do not read.
 * 3. A contact value that must be exact — an email address, a phone number, a
 *    link — has the shape of one and is one of the values of that kind in the
 *    facts it names: the whole value, not a part of one. Spacing does not
 *    matter, nor the punctuation of a phone number, nor the scheme of a link
 *    or the letter case of its host.
 * 4. In any other item, every quantity occurs in the facts it names, and so
 *    does every address it happens to contain.
 *
 * Nothing here calls a model: a rejection is a fact about the texts.
 */
export function rejectionReason(
  text: string,
  refs: number[],
  facts: ReadonlyMap<number, string>,
  rules: ItemRules = {},
): string | null {
  if (refs.length === 0) {
    return 'It names no fact.';
  }
  const maxRefs = rules.maxRefs ?? MAX_REFS;
  if (refs.length > maxRefs) {
    return `It names more than ${String(maxRefs)} facts.`;
  }
  const unknown = refs.filter((ref) => !facts.has(ref));
  if (unknown.length > 0) {
    return `It names fact ${unknown.join(', ')}, which does not exist.`;
  }
  if (rules.maxLength !== undefined && text.length > rules.maxLength) {
    return `It is longer than ${String(rules.maxLength)} characters.`;
  }
  if (hasUnreadableNumber(text)) {
    return 'It writes a number in characters other than the digits 0–9.';
  }

  const quotes = refs.map((ref) => facts.get(ref) ?? '');
  if (rules.exact) {
    return isExactCopy(rules.exact, text, quotes)
      ? null
      : `It is not a complete ${KIND_NAMES[rules.exact]} copied exactly from a fact it names.`;
  }
  return unsupportedNumber(text, quotes) ?? unsupportedAddress(text, quotes);
}

/**
 * Applies the checks to every item of a draft and builds the CV from what
 * passes. An item that fails is left out — a field becomes empty, a bullet,
 * skill or link disappears — and is reported with its reason. An item the
 * writer left empty is simply absent: no fact, no content.
 */
export function checkDraft(draft: CvDraft, checkableFacts: CheckableFact[]): CheckedDraft {
  const facts = new Map(checkableFacts.map((fact) => [fact.ref, fact.quote]));
  const rejected: Rejection[] = [];

  /** The text if it passes, or an empty string. */
  const accept = (path: string, raw: string, refs: number[], rules: ItemRules): string => {
    const text = cleanItemText(raw);
    if (text === '') {
      return '';
    }
    const reason = rejectionReason(text, refs, facts, rules);
    if (reason !== null) {
      rejected.push({ path, text, reason });
      return '';
    }
    return text;
  };
  /** The items of a list that pass, up to the limit of the list. */
  const acceptList = <T>(
    path: string,
    items: T[],
    limit: number,
    check: (item: T, itemPath: string) => string,
  ): string[] => {
    const accepted: string[] = [];
    items.forEach((item, index) => {
      const itemPath = `${path}[${String(index)}]`;
      const text = check(item, itemPath);
      if (text === '') {
        return;
      }
      if (accepted.length === limit) {
        rejected.push({ path: itemPath, text, reason: `There may be at most ${String(limit)}.` });
        return;
      }
      accepted.push(text);
    });
    return accepted;
  };
  const short = { maxLength: CV_LIMITS.shortText };

  const { contact: draftContact } = draft;
  const contact = {
    fullName: accept(
      'contact.fullName',
      draftContact.fullName.value,
      draftContact.fullName.facts,
      short,
    ),
    email: accept('contact.email', draftContact.email.value, draftContact.email.facts, {
      ...short,
      exact: 'email',
    }),
    phone: accept('contact.phone', draftContact.phone.value, draftContact.phone.facts, {
      ...short,
      exact: 'phone',
    }),
    location: accept(
      'contact.location',
      draftContact.location.value,
      draftContact.location.facts,
      short,
    ),
    links: acceptList('contact.links', draftContact.links, CV_LIMITS.links, (link, path) =>
      accept(path, link.value, link.facts, { maxLength: CV_LIMITS.link, exact: 'link' }),
    ),
  };

  const summary = accept('summary', draft.summary.text, draft.summary.facts, {
    maxLength: CV_LIMITS.summary,
    maxRefs: MAX_SUMMARY_REFS,
  });

  const experience: CvExperience[] = [];
  draft.experience.forEach((entry, index) => {
    const path = `experience[${String(index)}]`;
    const field = (name: 'company' | 'title' | 'location' | 'startDate' | 'endDate') =>
      accept(`${path}.${name}`, entry[name], entry.facts, short);
    const checked: CvExperience = {
      company: field('company'),
      title: field('title'),
      location: field('location'),
      startDate: field('startDate'),
      endDate: field('endDate'),
      bullets: acceptList(
        `${path}.bullets`,
        entry.bullets,
        CV_LIMITS.bullets,
        (bullet, bulletPath) =>
          accept(bulletPath, bullet.text, bullet.facts, { maxLength: CV_LIMITS.bullet }),
      ),
    };
    // A position that has neither an employer nor a title is not a position.
    if (checked.company === '' && checked.title === '') {
      const remains = [
        checked.location,
        checked.startDate,
        checked.endDate,
        ...checked.bullets,
      ].find((text) => text !== '');
      if (remains !== undefined) {
        rejected.push({
          path,
          text: remains,
          reason: 'It belongs to a position without a supported employer or title.',
        });
      }
    } else if (experience.length === CV_LIMITS.experience) {
      rejected.push({
        path,
        text: `${checked.title} ${checked.company}`.trim(),
        reason: `There may be at most ${String(CV_LIMITS.experience)}.`,
      });
    } else {
      experience.push(checked);
    }
  });

  const education: CvEducation[] = [];
  draft.education.forEach((entry, index) => {
    const path = `education[${String(index)}]`;
    const field = (name: 'institution' | 'degree' | 'startDate' | 'endDate') =>
      accept(`${path}.${name}`, entry[name], entry.facts, short);
    const checked: CvEducation = {
      institution: field('institution'),
      degree: field('degree'),
      startDate: field('startDate'),
      endDate: field('endDate'),
      details: accept(`${path}.details`, entry.details, entry.facts, {
        maxLength: CV_LIMITS.details,
      }),
    };
    if (checked.institution === '' && checked.degree === '') {
      const remains = [checked.startDate, checked.endDate, checked.details].find(
        (text) => text !== '',
      );
      if (remains !== undefined) {
        rejected.push({
          path,
          text: remains,
          reason: 'It belongs to an education entry without a supported institution or degree.',
        });
      }
    } else if (education.length === CV_LIMITS.education) {
      rejected.push({
        path,
        text: `${checked.degree} ${checked.institution}`.trim(),
        reason: `There may be at most ${String(CV_LIMITS.education)}.`,
      });
    } else {
      education.push(checked);
    }
  });

  const skills = acceptList('skills', draft.skills, CV_LIMITS.skills, (skill, path) =>
    accept(path, skill.name, skill.facts, { maxLength: CV_LIMITS.skill }),
  );

  return { document: { contact, summary, experience, education, skills }, rejected };
}

/** Whether a checked CV has anything in it at all. */
export function isEmptyDocument(document: CvDocument): boolean {
  const { contact, summary, experience, education, skills } = document;
  return (
    [contact.fullName, contact.email, contact.phone, contact.location, summary].every(
      (text) => text === '',
    ) && contact.links.length + experience.length + education.length + skills.length === 0
  );
}

/** How many items a CV has: every non-empty field, bullet point, skill and link. */
export function countItems(document: CvDocument): number {
  const { contact, summary, experience, education, skills } = document;
  const texts = [
    contact.fullName,
    contact.email,
    contact.phone,
    contact.location,
    ...contact.links,
    summary,
    ...experience.flatMap((entry) => [
      entry.company,
      entry.title,
      entry.location,
      entry.startDate,
      entry.endDate,
      ...entry.bullets,
    ]),
    ...education.flatMap((entry) => [
      entry.institution,
      entry.degree,
      entry.startDate,
      entry.endDate,
      entry.details,
    ]),
    ...skills,
  ];
  return texts.filter((text) => text !== '').length;
}
