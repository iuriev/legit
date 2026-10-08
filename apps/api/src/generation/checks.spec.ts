import type { CvDocument } from '@cv-builder/contracts';

import { CV_LIMITS } from '../cvs/cv-document.schema';
import {
  checkDraft,
  cleanItemText,
  hasUnreadableNumber,
  isEmptyDocument,
  joinedNumbersIn,
  MAX_REFS,
  MAX_SUMMARY_REFS,
  numbersIn,
  readableFact,
  rejectionReason,
} from './checks';
import type { CvDraft } from './draft';

const FACT_ONE = 'Olena Šimić, olena@example.com, +380 50 123 45 67, github.com/olena';
const FACTS = new Map([
  [1, FACT_ONE],
  [2, 'Backend engineer at Acme, March 2019 – June 2022, Kyiv'],
  [3, 'Cut build time by 40% and served 1,200 customers on Amazon S3'],
  [4, 'BSc in Computer Science, KPI, 2012–2016'],
  [5, 'Skills: Node.js, PostgreSQL'],
]);
const checkable = [...FACTS].map(([ref, quote]) => ({ ref, quote }));

const none = { value: '', facts: [] };
const emptyDraft = (): CvDraft => ({
  contact: { fullName: none, email: none, phone: none, location: none, links: [] },
  summary: { text: '', facts: [] },
  experience: [],
  education: [],
  skills: [],
});
const degree = (
  overrides: Partial<CvDraft['education'][number]> = {},
): CvDraft['education'][number] => ({
  institution: 'KPI',
  degree: 'BSc in Computer Science',
  startDate: '2012',
  endDate: '2016',
  details: '',
  facts: [4],
  ...overrides,
});
const job = (
  overrides: Partial<CvDraft['experience'][number]> = {},
): CvDraft['experience'][number] => ({
  company: 'Acme',
  title: 'Backend Engineer',
  location: 'Kyiv',
  startDate: 'March 2019',
  endDate: 'June 2022',
  facts: [2],
  bullets: [],
  ...overrides,
});

describe('numbersIn', () => {
  it.each([
    ['Cut build time by 40%', ['40']],
    ['March 2019 – June 2022', ['2019', '2022']],
    ['5+ years, 1st place', ['5', '1']],
    ['no numbers here, not even one', []],
    ['1,200 customers', ['1200']],
    ['1 200 customers', ['1200']],
    ['1200 customers', ['1200']],
    ['10,000,000 requests', ['10000000']],
    ['from 03/2019', ['3', '2019']],
    ['01.2019 – 03.2022', ['1', '2019', '3', '2022']],
    ['3.5 years', ['3', '5']],
    ['Amazon S3, B2B, ES6', ['3', '2', '6']],
    ['in 2019, 2022 and 2024', ['2019', '2022', '2024']],
    ['12 2019', ['12', '2019']],
    ['0 downtime and zero incidents', ['0']],
    // Number words state a quantity too.
    ['Eight years of experience', ['8']],
    ['a team of forty engineers', ['40']],
    ['twenty-five services, twenty five teams, twentyfive offices', ['25']],
    ['seventeen offices', ['17']],
    ['an eightfold increase', ['8']],
    ['2 million dollars over a decade', ['2', 'million', 'decade']],
    ['hundreds of thousands of users', ['hundred', 'thousand']],
    ['dozens of billions, a trillion', ['dozen', 'billion', 'trillion']],
    ['a multimillion-dollar budget over two centuries', ['million', '2', 'century']],
    [
      'doubled revenue, tripled users, halved cost, twice as fast',
      ['double', 'triple', 'half', 'twice'],
    ],
    // Ordinary words that only look like numbers.
    ['often attended, tenure, someone, one-on-one, scaffold', []],
    ['two-factor authentication on a three-tier system', ['2', '3']],
  ])('reads %j as %j', (text, expected) => {
    expect([...numbersIn(text)].sort()).toEqual([...expected].sort());
  });
});

describe('joinedNumbersIn', () => {
  it.each([
    ['GPA 3.9 and version 18.2.1', ['3.9', '18.2.1']],
    ["1'200 users, 3,5 years, 1_200 rows", ["1'200", '3,5', '1_200']],
    ['cut latency to .5 seconds, by 40 .6%', ['.5', '.6']],
    ['raised 3·5M and 3٫5M', ['3·5', '3٫5']],
    ['1,200 users and 10,000,000 requests', []],
    ['from 03/2019 to 2022. 5 years later', []],
    ['on 12.03.2019', ['12.03.2019']],
  ])('finds %j in %j', (text, expected) => {
    expect(joinedNumbersIn(text)).toEqual(expected);
  });
});

describe('hasUnreadableNumber', () => {
  it.each([
    'Cut costs by ４０%',
    'Managed ⁵⁰ people',
    'Led ⑧ engineers',
    'Grew revenue by ٧٥٪',
    'Worked 3½ years',
    '10⁶ listings',
    'm² pricing',
    'Led 4͏0 people',
    'Led 4️0 people',
  ])('finds one in %j', (text) => {
    expect(hasUnreadableNumber(text)).toBe(true);
  });

  it('finds none in ordinary text of any script', () => {
    expect(hasUnreadableNumber("Zoë O'Brien™ led 40 people in Київ, 2019–2022 — naïve café")).toBe(
      false,
    );
  });
});

describe('readableFact', () => {
  it('makes full-width digits plain and keeps a superscript or fraction apart from its neighbours', () => {
    expect(readableFact('２０１９年')).toBe('2019年');
    expect([...numbersIn(readableFact('10⁶ listings over 3½ years'))].sort()).toEqual(
      ['1', '10', '2', '3', '6'].sort(),
    );
  });
});

describe('cleanItemText', () => {
  it('removes what cannot be seen and changes nothing else', () => {
    expect(cleanItemText('Led 4​0 peo­pleㅤ ')).toBe('Led 40 people');
    expect(cleanItemText("Zoë O'Brien™, 10⁶")).toBe("Zoë O'Brien™, 10⁶");
  });
});

describe('rejectionReason', () => {
  describe('references', () => {
    it('accepts an item that names facts that exist', () => {
      expect(rejectionReason('Worked as a backend engineer at Acme', [2, 3], FACTS)).toBeNull();
    });

    it('rejects an item that names no fact', () => {
      expect(rejectionReason('Led a team', [], FACTS)).toBe('It names no fact.');
    });

    it('rejects an item that names a fact that does not exist for this CV', () => {
      expect(rejectionReason('Led a team', [2, 99], FACTS)).toMatch(/fact 99.*does not exist/);
    });

    it('rejects an item that names so many facts that it rests on none in particular', () => {
      const many = new Map(
        Array.from({ length: 30 }, (_unused, index) => [index + 1, 'Team of 40']),
      );
      const refs = [...many.keys()];

      expect(rejectionReason('Led 40 people', refs.slice(0, MAX_REFS), many)).toBeNull();
      expect(rejectionReason('Led 40 people', refs.slice(0, MAX_REFS + 1), many)).toMatch(
        /more than/,
      );
      expect(
        rejectionReason('Led 40 people', refs.slice(0, MAX_SUMMARY_REFS), many, {
          maxRefs: MAX_SUMMARY_REFS,
        }),
      ).toBeNull();
    });

    it('rejects an item over its length limit', () => {
      expect(rejectionReason('x'.repeat(11), [2], FACTS, { maxLength: 10 })).toMatch(
        /longer than 10/,
      );
    });
  });

  describe('numbers', () => {
    it('accepts a number that one of its facts contains', () => {
      expect(rejectionReason('Cut build time by 40%', [3], FACTS)).toBeNull();
    });

    it('rejects a number that none of its facts contains', () => {
      expect(rejectionReason('Cut build time by 40%', [2], FACTS)).toMatch(
        /number 40 does not occur/,
      );
    });

    it('does not let a number be supported by a fact the item does not name', () => {
      // Fact 3 has the number, but the item rests on fact 5.
      expect(rejectionReason('Served 1200 customers', [5], FACTS)).toMatch(/1200/);
    });

    it('rejects a number worked out from the facts, in digits or in words', () => {
      const dates = new Map([[1, 'Engineer since 2016, until 2024']]);

      expect(rejectionReason('8 years of experience', [1], dates)).toMatch(
        /number 8 does not occur/,
      );
      expect(rejectionReason('Eight years of experience', [1], dates)).toMatch(/number 8/);
      expect(rejectionReason('Nearly a decade of experience', [1], dates)).toMatch(/decade/);
    });

    it('rejects an invented quantity written in words', () => {
      const plain = new Map([[1, 'Led a team and cut costs']]);

      expect(rejectionReason('Led a team of forty engineers', [1], plain)).toMatch(/number 40/);
      expect(rejectionReason('Cut costs by forty percent', [1], plain)).toMatch(/number 40/);
      expect(rejectionReason('Managed millions of users', [1], plain)).toMatch(/million/);
    });

    it('lets a number in words support the same number in digits, and the other way round', () => {
      const words = new Map([[1, 'Led three engineers and twenty-five services']]);
      const digits = new Map([[1, 'Led 3 engineers']]);

      expect(rejectionReason('Led 3 engineers across 25 services', [1], words)).toBeNull();
      expect(rejectionReason('Led three engineers', [1], digits)).toBeNull();
    });

    it('ignores grouping separators when it compares numbers', () => {
      expect(rejectionReason('Served 1200 customers', [3], FACTS)).toBeNull();
      expect(rejectionReason('Served 1 200 customers', [3], FACTS)).toBeNull();
      expect(rejectionReason('Served 1,200 customers', [3], FACTS)).toBeNull();
      expect(rejectionReason('Served 12,000 customers', [3], FACTS)).not.toBeNull();
    });

    it('treats a digit inside a word as a number that must come from the facts', () => {
      expect(rejectionReason('Stored files on AWS S3', [3], FACTS)).toBeNull();
      expect(rejectionReason('Ran services on EC2', [3], FACTS)).toMatch(/number 2 does not occur/);
    });

    it.each([
      ['GPA 3.9', 'Graduated 9 March 2019, 3 awards'],
      ['Raised $3.5M', 'Raised $35M across 3 rounds, 5 investors'],
      ['Cut build time by 40.6%', 'Cut build time by 40% in 6 weeks'],
      ['Served 1.200 users', 'Served 200 users in 1 region'],
      ["Served 1'200 users", 'Served 200 users in 1 region'],
    ])('rejects %j built from separate numbers of %j', (text, fact) => {
      expect(rejectionReason(text, [1], new Map([[1, fact]]))).toMatch(/does not occur/);
    });

    it('accepts a decimal that a fact gives in the same form', () => {
      const fact = new Map([[1, 'GPA 3.9, released version 18.2.1']]);

      expect(rejectionReason('Graduated with a GPA of 3.9', [1], fact)).toBeNull();
      expect(rejectionReason('Released version 18.2.1', [1], fact)).toBeNull();
    });

    it.each([
      ['full-width digits', 'Cut costs by ４０%'],
      ['superscript digits', 'Managed ⁵⁰ people'],
      ['circled digits', 'Led ⑧ engineers'],
      ['digits split by an invisible character', 'Led 4​0 people'],
      ['Arabic-Indic digits', 'Grew revenue by ٧٥٪'],
      ['a fraction sign', 'Cut costs by ½'],
    ])('does not let %s slip past', (_name, text) => {
      const plain = new Map([[1, 'Cut costs and led a team']]);

      expect(rejectionReason(text, [1], plain)).not.toBeNull();
    });

    it('reads full-width digits in a fact as the digits they are', () => {
      const japanese = new Map([[1, 'アクメ株式会社 ２０１９年 – ２０２２年']]);

      expect(rejectionReason('Acme, 2019 – 2022', [1], japanese)).toBeNull();
    });

    it.each([
      ['March 2019', 'Backend engineer, 03.2019 – 06.2022'],
      ['2019 – present', 'Acme, 2019 – present'],
      ['5+ years of Node.js', '5+ years of Node.js'],
      ['March 12, 2019', 'Joined on 12 March 2019'],
      ['Q1 2019', 'Promoted in Q1 2019'],
    ])('does not reject the legitimate %j from %j', (text, fact) => {
      expect(rejectionReason(text, [1], new Map([[1, fact]]))).toBeNull();
    });
  });

  describe('exact contact values', () => {
    it('accepts an email address, a phone number and a link copied from a fact', () => {
      expect(rejectionReason('olena@example.com', [1], FACTS, { exact: 'email' })).toBeNull();
      expect(rejectionReason('Olena@Example.com', [1], FACTS, { exact: 'email' })).toBeNull();
      expect(rejectionReason('+380 50 123 45 67', [1], FACTS, { exact: 'phone' })).toBeNull();
      expect(rejectionReason('+380501234567', [1], FACTS, { exact: 'phone' })).toBeNull();
      expect(rejectionReason('+380 (50) 123-45-67', [1], FACTS, { exact: 'phone' })).toBeNull();
      expect(rejectionReason('github.com/olena', [1], FACTS, { exact: 'link' })).toBeNull();
      expect(rejectionReason('GitHub.com/olena', [1], FACTS, { exact: 'link' })).toBeNull();
      expect(
        rejectionReason('https://github.com/olena/', [1], FACTS, { exact: 'link' }),
      ).toBeNull();
    });

    it.each<[string, 'email' | 'phone' | 'link', string, string]>([
      ['an address one character different', 'email', 'olena.simic@example.com', FACT_ONE],
      [
        'an address that is the end of another',
        'email',
        'ann@example.com',
        'Contact joann@example.com',
      ],
      ['an address cut short', 'email', 'ann@example.co', 'ann@example.com'],
      ['an address that is the start of another', 'email', 'ann@example.com', 'ann@example.com.ua'],
      [
        'words that are not an address',
        'email',
        'Backend engineer at Acme',
        'Backend engineer at Acme',
      ],
      ['an address glued from separate words', 'email', 'acme@kyiv', 'Acme @ Kyiv'],
      ['a phone number with a digit changed', 'phone', '+380 50 123 45 68', FACT_ONE],
      ['a phone number without its last digit', 'phone', '+380 50 123 45 6', FACT_ONE],
      ['a fragment of a phone number', 'phone', '50 123 45', FACT_ONE],
      ['a single digit', 'phone', '5', FACT_ONE],
      ['letters in a phone number', 'phone', 'call 555 123 4567 now', 'call 555 123 4567 now'],
      ['a different profile on the same site', 'link', 'github.com/ole', FACT_ONE],
      ['the site without the profile', 'link', 'github.com', FACT_ONE],
      ['a link with a path whose case differs', 'link', 'github.com/Olena', FACT_ONE],
      ['a link with a space in it', 'link', 'github.com/ol ena', 'github.com/ol ena'],
      ['a scheme that is not http', 'link', 'javascript:alert(1)', 'see javascript:alert(1)'],
      [
        'the domain of an email address as a link',
        'link',
        'example.com',
        'Write to olena@example.com',
      ],
    ])('rejects %s', (_name, exact, value, fact) => {
      expect(rejectionReason(value, [1], new Map([[1, fact]]), { exact })).toMatch(
        /copied exactly/,
      );
    });

    it('rejects a value that exists only in a fact the item does not name', () => {
      expect(rejectionReason('olena@example.com', [2], FACTS, { exact: 'email' })).not.toBeNull();
    });
  });

  describe('whole values only', () => {
    const one = (fact: string) => new Map([[1, fact]]);

    it.each<[string, string]>([
      ['brien@example.com', "Email: o'brien@example.com"],
      ['ann@example.com', 'jo&ann@example.com'],
      ['ann@example.com', 'a/ann@example.com'],
      ['rgen@example.com', 'jürgen@example.com'],
    ])('rejects the email %j when the fact has %j', (value, fact) => {
      expect(rejectionReason(value, [1], one(fact), { exact: 'email' })).not.toBeNull();
    });

    it('accepts an address with unusual characters when it is the whole address', () => {
      expect(
        rejectionReason("o'brien@example.com", [1], one("Email: o'brien@example.com."), {
          exact: 'email',
        }),
      ).toBeNull();
      expect(
        rejectionReason('jürgen@example.com', [1], one('(jürgen@example.com)'), { exact: 'email' }),
      ).toBeNull();
    });

    it.each<[string, string]>([
      ['https://example.com', 'https://example.com:8080/x'],
      ['example.com', 'example.com?u=ann'],
      ['https://example.com/a', 'https://example.com/a,b'],
      ['ann.smith', 'ann.smith@example.com'],
      ['3.5', 'Rails 3.5 upgrade'],
      ['10.0.0.1', 'Host 10.0.0.1'],
    ])('rejects the link %j when the fact has %j', (value, fact) => {
      expect(rejectionReason(value, [1], one(fact), { exact: 'link' })).not.toBeNull();
    });

    it('accepts a link with a port, a query or brackets when it is the whole link', () => {
      const fact = one(
        'See https://example.com:8080/x?u=1#top and "www.olena.dev", (https://en.wikipedia.org/wiki/Foo_(bar)).',
      );

      expect(
        rejectionReason('https://example.com:8080/x?u=1#top', [1], fact, { exact: 'link' }),
      ).toBeNull();
      expect(rejectionReason('www.olena.dev', [1], fact, { exact: 'link' })).toBeNull();
      expect(
        rejectionReason('https://en.wikipedia.org/wiki/Foo_(bar)', [1], fact, { exact: 'link' }),
      ).toBeNull();
    });

    it('accepts an email address that ends a sentence in the fact', () => {
      expect(
        rejectionReason('ann@example.com', [1], one('Write to ann@example.com.'), {
          exact: 'email',
        }),
      ).toBeNull();
    });

    it('keeps the plus sign of a phone number significant and wants at least seven digits', () => {
      const fact = one('Tel +380 50 123 45 67, ext 123 45');

      expect(rejectionReason('380 50 123 45 67', [1], fact, { exact: 'phone' })).not.toBeNull();
      expect(rejectionReason('123 45', [1], fact, { exact: 'phone' })).not.toBeNull();
      expect(rejectionReason(' +380 50 123 45 67', [1], fact, { exact: 'phone' })).toBeNull();
    });

    it('does not read a phone number together with a number after a full stop or a dash', () => {
      expect(
        rejectionReason('+1 555 123 4567', [1], one('Tel +1 555 123 4567. 5 years at Acme'), {
          exact: 'phone',
        }),
      ).toBeNull();
      expect(
        rejectionReason('+1 555 123 4567', [1], one('+1 555 123 4567 – 2019'), { exact: 'phone' }),
      ).toBeNull();
    });

    it('does not glue the end of one fact to the start of the next', () => {
      const two = new Map([
        [1, 'Team of 4'],
        [2, '0 incidents, GPA 3'],
        [3, '.9 release'],
      ]);

      expect(rejectionReason('Led 40 people', [1, 2], two)).not.toBeNull();
      expect(rejectionReason('GPA 3.9', [2, 3], two)).not.toBeNull();
    });
  });

  describe('numbers in forms that must not slip through', () => {
    const one = (fact: string) => new Map([[1, fact]]);

    it.each<[string, string]>([
      ['Cut latency to .5 seconds', 'Cut latency by 5 seconds'],
      ['Raised $3·5M', '3 rounds, 5 investors'],
      ['Raised 3٫5M', '3 rounds, 5 investors'],
      ['Cut by 40 .6%', '40% in 6 weeks'],
      ['Served 1_200 users', 'Served 200 users in 1 region'],
      ['Led 4͏0 people', 'Team of 4 with 0 downtime'],
      ['Worked 3½ years on 10⁶ listings', 'Worked 3½ years on 10⁶ listings'],
      ['Zero downtime in one century', 'Since 2016 until 2024'],
      ['Doubled revenue', 'Grew revenue'],
      ['An eightfold increase', 'An increase'],
    ])('rejects %j on the fact %j', (text, fact) => {
      expect(rejectionReason(text, [1], one(fact))).not.toBeNull();
    });

    it('stores exactly the text that was checked', () => {
      const facts = [{ ref: 1, quote: "Zoë O'Brien™ of Київ" }];
      const draft = emptyDraft();
      draft.contact.fullName = { value: "Zoë O'Brien™", facts: [1] };

      expect(checkDraft(draft, facts).document.contact.fullName).toBe("Zoë O'Brien™");
    });
  });

  describe('addresses inside ordinary text', () => {
    const plain = new Map([
      [1, 'Olena built things in Kyiv, olena@example.com, https://olena.dev'],
    ]);

    it.each([
      'Olena evil@attacker.com',
      'Kyiv, see http://evil.example/cv',
      'Contact me at evil@attacker.com',
      'Portfolio at www.evil.example',
      'Run javascript://alert(x)',
      'Portfolio at ann-portfolio.dev/work',
      'Kyiv, linkedin.com/in/fake',
      'Follow @attacker',
    ])('rejects %j when no named fact has that address', (text) => {
      expect(rejectionReason(text, [1], plain)).toMatch(/copied exactly/);
    });

    it('accepts an address that a named fact has, and names of technologies with a dot', () => {
      expect(rejectionReason('Reach me at olena@example.com', [1], plain)).toBeNull();
      expect(rejectionReason('Portfolio: https://olena.dev', [1], plain)).toBeNull();
      expect(rejectionReason('Built things with Node.js and ASP.NET', [1], plain)).toBeNull();
    });
  });
});

describe('checkDraft', () => {
  it('builds the CV from the items that pass and drops the references', () => {
    const draft: CvDraft = {
      contact: {
        fullName: { value: 'Olena Šimić', facts: [1] },
        email: { value: 'olena@example.com', facts: [1] },
        phone: { value: '+380 50 123 45 67', facts: [1] },
        location: { value: 'Kyiv', facts: [2] },
        links: [{ value: 'github.com/olena', facts: [1] }],
      },
      summary: { text: 'Backend engineer with experience at Acme.', facts: [2] },
      experience: [
        job({
          bullets: [
            { text: 'Cut build time by 40%', facts: [3] },
            { text: 'Served 1,200 customers', facts: [3] },
          ],
        }),
      ],
      education: [
        {
          institution: 'KPI',
          degree: 'BSc in Computer Science',
          startDate: '2012',
          endDate: '2016',
          details: '',
          facts: [4],
        },
      ],
      skills: [
        { name: 'Node.js', facts: [5] },
        { name: 'PostgreSQL', facts: [5] },
      ],
    };

    expect(checkDraft(draft, checkable)).toEqual({
      rejected: [],
      document: {
        contact: {
          fullName: 'Olena Šimić',
          email: 'olena@example.com',
          phone: '+380 50 123 45 67',
          location: 'Kyiv',
          links: ['github.com/olena'],
        },
        summary: 'Backend engineer with experience at Acme.',
        experience: [
          {
            company: 'Acme',
            title: 'Backend Engineer',
            location: 'Kyiv',
            startDate: 'March 2019',
            endDate: 'June 2022',
            bullets: ['Cut build time by 40%', 'Served 1,200 customers'],
          },
        ],
        education: [
          {
            institution: 'KPI',
            degree: 'BSc in Computer Science',
            startDate: '2012',
            endDate: '2016',
            details: '',
          },
        ],
        skills: ['Node.js', 'PostgreSQL'],
      },
    });
  });

  it('leaves out a rejected bullet point and reports it with its place and reason', () => {
    const draft = {
      ...emptyDraft(),
      experience: [
        job({
          bullets: [
            { text: 'Cut build time by 40%', facts: [2] },
            { text: 'Built the billing service', facts: [2] },
          ],
        }),
      ],
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience[0]?.bullets).toEqual(['Built the billing service']);
    expect(rejected).toEqual([
      {
        path: 'experience[0].bullets[0]',
        text: 'Cut build time by 40%',
        reason: 'The number 40 does not occur in the facts it names.',
      },
    ]);
  });

  it('rejects a summary with a number worked out from dates', () => {
    const draft = {
      ...emptyDraft(),
      summary: { text: 'Engineer with 3 years of experience at Acme.', facts: [2] },
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.summary).toBe('');
    expect(rejected.map((rejection) => rejection.path)).toEqual(['summary']);
  });

  it('gives the CV no email address when the generated one is in no named fact', () => {
    const draft = emptyDraft();
    draft.contact.email = { value: 'olena.simic@example.com', facts: [1] };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.contact.email).toBe('');
    expect(rejected[0]).toMatchObject({ path: 'contact.email' });
  });

  it('treats what the writer left empty as absent, not as a rejection', () => {
    expect(checkDraft(emptyDraft(), checkable)).toEqual({
      rejected: [],
      document: {
        contact: { fullName: '', email: '', phone: '', location: '', links: [] },
        summary: '',
        experience: [],
        education: [],
        skills: [],
      },
    });
  });

  it('blanks one unsupported field of a position and keeps the rest', () => {
    const draft = { ...emptyDraft(), experience: [job({ endDate: 'June 2023' })] };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience[0]).toMatchObject({
      company: 'Acme',
      startDate: 'March 2019',
      endDate: '',
    });
    expect(rejected).toEqual([
      expect.objectContaining({ path: 'experience[0].endDate', text: 'June 2023' }),
    ]);
  });

  it('drops a position and a degree that name no fact, with everything under them', () => {
    const draft = {
      ...emptyDraft(),
      experience: [
        job({ facts: [], bullets: [{ text: 'Built the billing service', facts: [2] }] }),
      ],
      education: [
        { institution: 'MIT', degree: 'PhD', startDate: '', endDate: '', details: '', facts: [] },
      ],
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience).toEqual([]);
    expect(document.education).toEqual([]);
    expect(rejected.map((rejection) => rejection.path)).toEqual(
      expect.arrayContaining([
        'experience[0].company',
        'experience[0]',
        'education[0].institution',
      ]),
    );
  });

  it('rejects a degree that names a fact that does not exist', () => {
    const draft = {
      ...emptyDraft(),
      education: [
        { institution: 'MIT', degree: 'PhD', startDate: '', endDate: '', details: '', facts: [42] },
      ],
    };

    expect(checkDraft(draft, checkable).document.education).toEqual([]);
  });

  it('keeps lists within the limits of a CV and counts what did not fit', () => {
    const draft = {
      ...emptyDraft(),
      skills: Array.from({ length: CV_LIMITS.skills + 2 }, (_unused, index) => ({
        name: `Skill ${String.fromCharCode(97 + (index % 26))}${index >= 26 ? 'x' : ''}${index >= 52 ? 'y' : ''}`,
        facts: [5],
      })),
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.skills).toHaveLength(CV_LIMITS.skills);
    expect(rejected).toHaveLength(2);
  });

  it('rejects an item over the length limit of its field', () => {
    const draft = {
      ...emptyDraft(),
      summary: { text: 'a'.repeat(CV_LIMITS.summary + 1), facts: [2] },
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.summary).toBe('');
    expect(rejected[0]?.reason).toMatch(/longer than/);
  });

  it('stores every text as one plain line', () => {
    const draft = {
      ...emptyDraft(),
      summary: { text: 'Backend\u0000 engineer\n at  Acme\u202E', facts: [2] },
    };

    expect(checkDraft(draft, checkable).document.summary).toBe('Backend engineer at Acme');
  });

  it('rejects a phone number and a link that are not in the named fact', () => {
    const draft = emptyDraft();
    draft.contact.phone = { value: '+380 50 123 45 68', facts: [1] };
    draft.contact.links = [
      { value: 'github.com/olena', facts: [1] },
      { value: 'linkedin.com/in/olena', facts: [1] },
    ];

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.contact).toMatchObject({ phone: '', links: ['github.com/olena'] });
    expect(rejected.map((rejection) => rejection.path)).toEqual([
      'contact.phone',
      'contact.links[1]',
    ]);
  });

  it('rejects a name, a place and education details that name no fact', () => {
    const draft: CvDraft = {
      ...emptyDraft(),
      education: [
        {
          institution: 'KPI',
          degree: 'BSc',
          startDate: '',
          endDate: '',
          details: 'Graduated with honours',
          facts: [],
        },
      ],
    };
    draft.contact.fullName = { value: 'Olena Šimić', facts: [] };
    draft.contact.location = { value: 'London', facts: [99] };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.contact).toMatchObject({ fullName: '', location: '' });
    expect(document.education).toEqual([]);
    expect(rejected.map((rejection) => rejection.path)).toEqual(
      expect.arrayContaining(['contact.fullName', 'contact.location', 'education[0].details']),
    );
  });

  it('does not let a bullet point borrow a number from the facts of its position', () => {
    // The position rests on fact 2 (2019, 2022); the bullet names fact 5 only.
    const draft = {
      ...emptyDraft(),
      experience: [job({ bullets: [{ text: 'Promoted in 2019', facts: [5] }] })],
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience[0]?.bullets).toEqual([]);
    expect(rejected[0]).toMatchObject({ path: 'experience[0].bullets[0]' });
  });

  it('rejects an email address smuggled into a name, a place, a bullet point or a skill', () => {
    const draft: CvDraft = {
      ...emptyDraft(),
      experience: [job({ bullets: [{ text: 'Contact me at evil@attacker.com', facts: [2] }] })],
      skills: [{ name: 'evil@attacker.com', facts: [5] }],
    };
    draft.contact.fullName = { value: 'Olena evil@attacker.com', facts: [1] };
    draft.contact.location = { value: 'Kyiv, see http://evil.example/cv', facts: [2] };

    const { document } = checkDraft(draft, checkable);

    expect(JSON.stringify(document)).not.toContain('evil');
  });

  it('reports what is left of a position or a degree that lost its name', () => {
    const draft: CvDraft = {
      ...emptyDraft(),
      experience: [job({ company: '', title: '' })],
      education: [
        {
          institution: '',
          degree: '',
          startDate: '2012',
          endDate: '2016',
          details: '',
          facts: [4],
        },
      ],
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience).toEqual([]);
    expect(document.education).toEqual([]);
    expect(rejected.map((rejection) => rejection.path)).toEqual(['experience[0]', 'education[0]']);
  });

  it('keeps at most the allowed number of positions', () => {
    const draft = {
      ...emptyDraft(),
      experience: Array.from({ length: CV_LIMITS.experience + 1 }, () => job()),
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience).toHaveLength(CV_LIMITS.experience);
    expect(rejected).toHaveLength(1);
  });
});

describe('checkDraft, rule by rule', () => {
  it('wants an email address in the email field and a phone number in the phone field', () => {
    const draft = emptyDraft();
    // Both texts are in fact 1, but neither is what its field is for.
    draft.contact.email = { value: 'Olena Šimić', facts: [1] };
    draft.contact.phone = { value: 'github.com/olena', facts: [1] };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.contact).toMatchObject({ email: '', phone: '' });
    expect(rejected.map((rejection) => rejection.path)).toEqual(['contact.email', 'contact.phone']);
  });

  it.each<
    [string, number, (draft: CvDraft, text: string) => void, (document: CvDocument) => string]
  >([
    [
      'a name',
      CV_LIMITS.shortText,
      (d, text) => (d.contact.fullName = { value: text, facts: [1] }),
      (d) => d.contact.fullName,
    ],
    [
      'a bullet point',
      CV_LIMITS.bullet,
      (d, text) => (d.experience = [job({ bullets: [{ text, facts: [2] }] })]),
      (d) => d.experience[0]?.bullets[0] ?? '',
    ],
    [
      'a skill',
      CV_LIMITS.skill,
      (d, text) => (d.skills = [{ name: text, facts: [5] }]),
      (d) => d.skills[0] ?? '',
    ],
    [
      'a degree',
      CV_LIMITS.shortText,
      (d, text) => (d.education = [degree({ degree: text })]),
      (d) => d.education[0]?.degree ?? '',
    ],
    [
      'education details',
      CV_LIMITS.details,
      (d, text) => (d.education = [degree({ details: text })]),
      (d) => d.education[0]?.details ?? '',
    ],
  ])('keeps %s of exactly %i characters and rejects one more', (_name, limit, put, read) => {
    const atLimit = emptyDraft();
    put(atLimit, 'a'.repeat(limit));
    const over = emptyDraft();
    put(over, 'a'.repeat(limit + 1));

    expect(read(checkDraft(atLimit, checkable).document)).toHaveLength(limit);
    expect(read(checkDraft(over, checkable).document)).toBe('');
  });

  it('keeps a position that has an employer or a title, and a degree that has an institution or a name', () => {
    const draft: CvDraft = {
      ...emptyDraft(),
      experience: [job({ title: '' }), job({ company: '' })],
      education: [degree({ degree: '' }), degree({ institution: '' })],
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.experience.map(({ company, title }) => [company, title])).toEqual([
      ['Acme', ''],
      ['', 'Backend Engineer'],
    ]);
    expect(document.education.map(({ institution, degree: name }) => [institution, name])).toEqual([
      ['KPI', ''],
      ['', 'BSc in Computer Science'],
    ]);
    expect(rejected).toEqual([]);
  });

  it('keeps at most the allowed number of education entries', () => {
    const draft = {
      ...emptyDraft(),
      education: Array.from({ length: CV_LIMITS.education + 1 }, () => degree()),
    };

    const { document, rejected } = checkDraft(draft, checkable);

    expect(document.education).toHaveLength(CV_LIMITS.education);
    expect(rejected).toHaveLength(1);
  });
});

describe('isEmptyDocument, field by field', () => {
  const empty = checkDraft(emptyDraft(), checkable).document;

  it.each<[string, Partial<CvDocument>]>([
    ['an email address', { contact: { ...empty.contact, email: 'a@b.co' } }],
    ['a phone number', { contact: { ...empty.contact, phone: '+1 555 123 4567' } }],
    ['a place', { contact: { ...empty.contact, location: 'Kyiv' } }],
    ['a link', { contact: { ...empty.contact, links: ['github.com/olena'] } }],
    ['a summary', { summary: 'Engineer.' }],
    [
      'a position',
      {
        experience: [
          { company: 'Acme', title: '', location: '', startDate: '', endDate: '', bullets: [] },
        ],
      },
    ],
    [
      'a degree',
      { education: [{ institution: 'KPI', degree: '', startDate: '', endDate: '', details: '' }] },
    ],
  ])('is not empty with only %s', (_name, part) => {
    expect(isEmptyDocument({ ...empty, ...part })).toBe(false);
  });
});

describe('isEmptyDocument', () => {
  it('tells a CV with nothing in it from one with a single item', () => {
    const empty = checkDraft(emptyDraft(), checkable).document;

    expect(isEmptyDocument(empty)).toBe(true);
    expect(isEmptyDocument({ ...empty, skills: ['Node.js'] })).toBe(false);
    expect(isEmptyDocument({ ...empty, contact: { ...empty.contact, fullName: 'Olena' } })).toBe(
      false,
    );
  });
});
