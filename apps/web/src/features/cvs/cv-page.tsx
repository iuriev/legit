import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { ButtonLink } from '../../components/button';
import { ErrorNotice } from '../../components/notice';
import { PageShell } from '../../components/page-shell';
import { ApiError } from '../../lib/api/client';
import { cvsService } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';
import { AccountBar } from '../auth/session';
import { CvEditor } from './cv-editor';
import { CvFailure } from './cv-failure';
import { CvProgress } from './cv-progress';
import { CvQuestions } from './cv-questions';

const CV_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How often the page asks the server while a generation is running. */
const POLL_INTERVAL_MS = 1500;

/**
 * One CV, drawn from its state on the server: progress while it is being
 * generated, the questions while it waits for answers, the editor when it is
 * ready, the reason when it failed. The page keeps nothing of this itself, so
 * a reload, or opening it on another device, shows the same thing.
 */
export function CvPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cv = useQuery({
    queryKey: queryKeys.cv(id),
    queryFn: () => cvsService.get(id),
    // Anything that is not an identifier names no CV; the server is not asked.
    enabled: CV_ID.test(id),
    // Never an old copy: the editor starts from what the server holds now, not
    // from what this tab saw the last time the CV was open.
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.state === 'generating' ? POLL_INTERVAL_MS : false,
  });

  if (cv.isPending && CV_ID.test(id)) {
    return (
      <PageShell title="Your CV" account={<AccountBar />}>
        <p>Loading…</p>
      </PageShell>
    );
  }
  if (!cv.data) {
    const notFound = !CV_ID.test(id) || (cv.error instanceof ApiError && cv.error.status === 404);
    return (
      <PageShell title={notFound ? 'CV not found' : 'Your CV'} account={<AccountBar />}>
        <ErrorNotice
          messages={
            notFound
              ? ['This CV does not exist, or it was deleted.']
              : cv.error instanceof ApiError
                ? cv.error.messages
                : ['Could not load this CV.']
          }
        />
        <p>
          <ButtonLink to="/">Back to your CVs</ButtonLink>
        </p>
      </PageShell>
    );
  }

  const data = cv.data;
  const backToList = () => void navigate('/');
  return (
    <PageShell title={data.targetRole} account={<AccountBar />}>
      {data.state === 'generating' ? <CvProgress stage={data.stage} /> : null}
      {data.state === 'awaiting_answers' ? <CvQuestions cv={data} /> : null}
      {data.state === 'failed' ? <CvFailure cv={data} onDeleted={backToList} /> : null}
      {data.state === 'ready' && data.document ? (
        <CvEditor
          // A different CV is a different editor; the same CV keeps its edits.
          key={data.id}
          cv={{ ...data, document: data.document }}
          onDeleted={backToList}
        />
      ) : null}
    </PageShell>
  );
}
