import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { answerDrafts } from '../../lib/answer-drafts';
import { authService } from '../../lib/api/auth-service';
import { queryKeys } from '../../lib/api/query-keys';
import { unsavedChanges } from '../../lib/unsaved-changes';
import styles from './session.module.css';

/** Who is signed in. `null` means nobody; `undefined` means not known yet. */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => authService.me(),
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * The page a visitor asked for before being sent to sign in. Only a path of
 * this application is accepted, never an address somewhere else.
 */
export function requestedPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

/** The pages inside are for a signed-in user; anyone else is sent to sign in, and back afterwards. */
export function RequireSession() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) {
    return <p className={styles.loading}>Loading…</p>;
  }
  if (!session.data) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/**
 * The sign-in and sign-up pages are for visitors. A user who is signed in, or
 * has just signed in, goes to the page they asked for, or to their CVs. This
 * is the one place that decides where to go after signing in.
 */
export function VisitorsOnly() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) {
    return <p className={styles.loading}>Loading…</p>;
  }
  return session.data ? <Navigate to={requestedPath(location.state)} replace /> : <Outlet />;
}

/** The account in the header: who is signed in, and the way out. */
export function AccountBar() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!session.data) {
    return null;
  }

  const signOut = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await authService.signOut();
    } catch {
      // Still signed in: stay where we are, with everything intact.
      setBusy(false);
      setAsking(false);
      setFailed(true);
      return;
    }
    // Nothing of this user's data stays behind for the next one.
    unsavedChanges.leaving = true;
    answerDrafts.removeAll();
    queryClient.clear();
    queryClient.setQueryData(queryKeys.session, null);
    await navigate('/sign-in', { replace: true });
    unsavedChanges.leaving = false;
  };

  return (
    <div className={styles.account}>
      <span className={styles.email}>{session.data.email}</span>
      <Button
        busy={busy}
        onClick={() => {
          // Signing out leaves the page; unsaved edits are asked about first.
          if (unsavedChanges.present) {
            setAsking(true);
          } else {
            void signOut();
          }
        }}
      >
        Sign out
      </Button>
      {failed ? (
        <p className={styles.failed} role="alert">
          Could not sign out. Try again.
        </p>
      ) : null}
      <ConfirmDialog
        open={asking}
        title="Sign out without saving?"
        confirmLabel="Sign out"
        cancelLabel="Stay"
        danger
        busy={busy}
        onConfirm={() => void signOut()}
        onCancel={() => {
          setAsking(false);
        }}
      >
        <p>Your changes to this CV have not been saved and will be lost.</p>
      </ConfirmDialog>
    </div>
  );
}
