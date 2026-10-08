import type { Cv } from '@cv-builder/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useEffect, useState } from 'react';

import { Button } from '../../components/button';
import { TextArea } from '../../components/field';
import { ErrorNotice } from '../../components/notice';
import { answerDrafts } from '../../lib/answer-drafts';
import { ApiError } from '../../lib/api/client';
import { cvsService } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';
import { SOURCE_LIMITS } from '../../lib/cv-limits';
import styles from './cv-questions.module.css';

const SECTION_LABELS: Record<Cv['questions'][number]['section'], string> = {
  contact: 'Contact details',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
};

/**
 * The questions about what the source did not say. Each one may be answered or
 * left blank; everything is sent together, once.
 */
export function CvQuestions({ cv }: { cv: Cv }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState(() => answerDrafts.read(cv.id));

  useEffect(() => {
    answerDrafts.write(cv.id, answers);
  }, [cv.id, answers]);

  const submit = useMutation({
    mutationFn: () =>
      cvsService.answer(
        cv.id,
        cv.questions.map((question) => {
          const answer = (answers[question.id] ?? '').trim();
          // A question left blank is skipped.
          return { questionId: question.id, answer: answer === '' ? null : answer };
        }),
      ),
    onSettled: async (_result, error) => {
      // Sent, or already sent from another tab: either way the server knows best.
      if (!error || (error instanceof ApiError && error.code === 'invalid_state')) {
        answerDrafts.remove(cv.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.cv(cv.id) });
    },
  });

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    submit.mutate();
  };
  const failed =
    submit.error && !(submit.error instanceof ApiError && submit.error.code === 'invalid_state');

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.intro}>
        <h2>A few questions first</h2>
        <p>
          Your document does not say everything a CV for this role needs. Answer what you can and
          leave the rest blank: nothing will be made up for a question you skip, and you can edit
          the CV by hand afterwards.
        </p>
      </div>
      {failed ? (
        <ErrorNotice
          messages={
            submit.error instanceof ApiError
              ? submit.error.messages
              : ['Your answers could not be sent. Try again.']
          }
        />
      ) : null}
      {cv.questions.map((question) => (
        <TextArea
          key={question.id}
          label={question.text}
          hint={`${SECTION_LABELS[question.section]} · optional`}
          rows={2}
          maxLength={SOURCE_LIMITS.answer}
          value={answers[question.id] ?? ''}
          onChange={(event) => {
            setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
          }}
        />
      ))}
      <div>
        <Button type="submit" variant="primary" busy={submit.isPending}>
          Write my CV
        </Button>
      </div>
    </form>
  );
}
