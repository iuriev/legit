import { cleanQuestions, MAX_QUESTION_LENGTH, MAX_QUESTIONS, questionsSchema } from './questions';

describe('cleanQuestions', () => {
  it('keeps at most eight questions, in the order given', () => {
    const twelve = Array.from({ length: 12 }, (_unused, index) => ({
      section: 'experience' as const,
      text: `Question ${String(index + 1)}?`,
    }));

    const cleaned = cleanQuestions(twelve);

    expect(cleaned).toHaveLength(MAX_QUESTIONS);
    expect(cleaned[0]?.text).toBe('Question 1?');
    expect(cleaned[7]?.text).toBe('Question 8?');
  });

  it('drops blank, oversized and repeated questions and tidies whitespace', () => {
    const cleaned = cleanQuestions([
      { section: 'contact', text: '   ' },
      { section: 'contact', text: 'x'.repeat(MAX_QUESTION_LENGTH + 1) },
      { section: 'contact', text: '  What is your\n email address? ' },
      { section: 'summary', text: 'what is your email address?' },
    ]);

    expect(cleaned).toEqual([{ section: 'contact', text: 'What is your email address?' }]);
  });
});

describe('cleanQuestions on content', () => {
  it('drops a question for a section that is not one of the five instead of failing', () => {
    const cleaned = cleanQuestions([
      { section: 'certifications', text: 'Which certificates do you hold?' },
      { section: 'education', text: 'Where did you study?' },
    ]);

    expect(cleaned).toEqual([{ section: 'education', text: 'Where did you study?' }]);
  });

  it('drops a question that carries a link', () => {
    const cleaned = cleanQuestions([
      { section: 'contact', text: 'Verify your account at https://evil.example/login' },
      { section: 'contact', text: 'Confirm at www.evil.example please' },
      { section: 'contact', text: 'What is your email address?' },
    ]);

    expect(cleaned.map((question) => question.text)).toEqual(['What is your email address?']);
  });

  it('removes control characters and direction overrides', () => {
    const cleaned = cleanQuestions([
      { section: 'contact', text: 'What is\u0000 your \u202Ename?' },
    ]);

    expect(cleaned[0]?.text).toBe('What is your name?');
  });
});

describe('questionsSchema', () => {
  it('accepts an empty list', () => {
    expect(questionsSchema.safeParse({ questions: [] }).success).toBe(true);
  });

  it('rejects a missing list and a question without text', () => {
    expect(questionsSchema.safeParse({}).success).toBe(false);
    expect(questionsSchema.safeParse({ questions: [{ section: 'contact' }] }).success).toBe(false);
  });
});
