import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { answerDrafts } from '../../lib/answer-drafts';
import { cvsService } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';

/** A button that deletes a CV after the owner has confirmed it. */
export function DeleteCvButton({
  id,
  targetRole,
  onDeleted,
}: {
  id: string;
  targetRole: string;
  onDeleted?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => cvsService.remove(id),
    onSuccess: async () => {
      setAsking(false);
      answerDrafts.remove(id);
      queryClient.removeQueries({ queryKey: queryKeys.cv(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.cvs, exact: true });
      onDeleted?.();
    },
  });

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setAsking(true);
        }}
      >
        Delete<span className="visually-hidden"> the CV for {targetRole}</span>
      </Button>
      <ConfirmDialog
        open={asking}
        title="Delete this CV?"
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
        onCancel={() => {
          setAsking(false);
        }}
      >
        <p>The CV for “{targetRole}” and everything it was built from will be removed for good.</p>
        {remove.isError ? <p role="alert">It could not be deleted. Try again.</p> : null}
      </ConfirmDialog>
    </>
  );
}
