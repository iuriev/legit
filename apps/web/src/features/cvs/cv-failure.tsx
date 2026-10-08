import type { Cv } from '@cv-builder/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button, ButtonLink } from '../../components/button';
import { ErrorNotice, Notice } from '../../components/notice';
import { ApiError } from '../../lib/api/client';
import { cvsService } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';
import styles from './cv-failure.module.css';
import { DeleteCvButton } from './delete-cv';

/** Why the generation failed, in the server's words, and what can be done about it. */
export function CvFailure({ cv, onDeleted }: { cv: Cv; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => cvsService.retry(cv.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.cv(cv.id) }),
  });

  return (
    <section className={styles.failure}>
      <Notice kind="error">
        <h2>We could not build this CV</h2>
        <p>{cv.failure?.message}</p>
      </Notice>
      {retry.error ? (
        <ErrorNotice
          messages={
            retry.error instanceof ApiError ? retry.error.messages : ['Could not retry. Try again.']
          }
        />
      ) : null}
      <div className={styles.actions}>
        {cv.failure?.retryable ? (
          <Button
            variant="primary"
            busy={retry.isPending}
            onClick={() => {
              retry.mutate();
            }}
          >
            Try again
          </Button>
        ) : (
          <ButtonLink to="/new" variant="primary">
            Start a new CV
          </ButtonLink>
        )}
        <DeleteCvButton id={cv.id} targetRole={cv.targetRole} onDeleted={onDeleted} />
      </div>
    </section>
  );
}
