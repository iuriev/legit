import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ButtonLink } from '../../components/button';
import { ErrorNotice } from '../../components/notice';
import { PageShell } from '../../components/page-shell';
import { ApiError } from '../../lib/api/client';
import { cvsService } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';
import { AccountBar } from '../auth/session';
import styles from './cv-list-page.module.css';
import { formatDate, STATE_LABELS } from './cv-text';
import { DeleteCvButton } from './delete-cv';

export function CvListPage() {
  const cvs = useQuery({
    queryKey: queryKeys.cvs,
    queryFn: cvsService.list,
    // While something is being generated, the list keeps itself current.
    refetchInterval: (query) =>
      query.state.data?.some((cv) => cv.state === 'generating') ? 3000 : false,
  });

  return (
    <PageShell
      title="Your CVs"
      account={<AccountBar />}
      action={
        <ButtonLink to="/new" variant="primary">
          New CV
        </ButtonLink>
      }
    >
      {cvs.isPending ? <p>Loading…</p> : null}
      {cvs.error ? (
        <ErrorNotice
          messages={
            cvs.error instanceof ApiError ? cvs.error.messages : ['Could not load your CVs.']
          }
        />
      ) : null}
      {cvs.data?.length === 0 ? (
        <p className={styles.empty}>
          You have no CVs yet. Upload your current CV or describe your background, name the role you
          are aiming for, and get a CV you can edit and download.
        </p>
      ) : null}
      <ul className={styles.list}>
        {cvs.data?.map((cv) => (
          <li key={cv.id} className={styles.item}>
            <div className={styles.summary}>
              <Link to={`/cvs/${cv.id}`} className={styles.role}>
                {cv.targetRole}
              </Link>
              <p className={styles.meta}>
                <span className={styles.state} data-state={cv.state}>
                  {STATE_LABELS[cv.state]}
                </span>
                <span>Changed {formatDate(cv.updatedAt)}</span>
              </p>
            </div>
            <DeleteCvButton id={cv.id} targetRole={cv.targetRole} />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
