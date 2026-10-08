const PREFIX = 'cv-answers:';

type Answers = Record<string, string>;

/**
 * Answers typed but not yet sent, kept in this tab so that a reload does not
 * lose them. They leave the tab when they are sent, when the CV is deleted and
 * when the user signs out.
 */
export const answerDrafts = {
  read(cvId: string): Answers {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(PREFIX + cvId) ?? '{}');
      if (typeof stored !== 'object' || stored === null) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(stored).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    } catch {
      return {};
    }
  },

  write(cvId: string, answers: Answers): void {
    sessionStorage.setItem(PREFIX + cvId, JSON.stringify(answers));
  },

  remove(cvId: string): void {
    sessionStorage.removeItem(PREFIX + cvId);
  },

  removeAll(): void {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  },
};
