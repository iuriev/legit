import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ButtonLink } from '../../components/button';
import { TextArea, TextField } from '../../components/field';
import { ErrorNotice } from '../../components/notice';
import { PageShell } from '../../components/page-shell';
import { ApiError } from '../../lib/api/client';
import { cvsService, type NewCvSource } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';
import { SOURCE_LIMITS } from '../../lib/cv-limits';
import { AccountBar } from '../auth/session';
import styles from './new-cv-page.module.css';

type SourceKind = NewCvSource['kind'];

/** A problem with the source that can be told before anything is sent. */
function checkSource(kind: SourceKind, file: File | null, text: string): string | null {
  if (kind === 'pdf') {
    if (!file) {
      return 'Choose a PDF file.';
    }
    if (file.size > SOURCE_LIMITS.pdfBytes) {
      return 'The PDF may be at most 5 MB.';
    }
    return null;
  }
  return text.trim() === '' ? 'Paste the text of your CV or describe your background.' : null;
}

export function NewCvPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sourceGroup = useId();
  const fileId = useId();
  const [kind, setKind] = useState<SourceKind>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string>();
  const sourceErrorId = useId();

  const create = useMutation({
    mutationFn: ({ targetRole, source }: { targetRole: string; source: NewCvSource }) =>
      cvsService.create(targetRole, source),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cvs, exact: true });
      await navigate(`/cvs/${id}`);
    },
  });

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const role = new FormData(event.currentTarget).get('targetRole');
    const targetRole = typeof role === 'string' ? role.trim() : '';
    const problem = checkSource(kind, file, text);
    // A role of spaces only passes the browser's "required"; it is still empty.
    const roleProblem = targetRole === '' ? 'Enter the role you are aiming for.' : undefined;
    setSourceError(problem);
    setRoleError(roleProblem);
    if (problem || roleProblem) {
      return;
    }
    create.mutate({
      targetRole,
      source: kind === 'pdf' && file ? { kind: 'pdf', file } : { kind: 'text', text },
    });
  };

  // What the server said about the source belongs next to the source.
  const error = create.error instanceof ApiError ? create.error : null;
  const sourceProblem =
    error?.code === 'invalid_source' || error?.code === 'payload_too_large'
      ? error.messages.join(' ')
      : null;

  return (
    <PageShell title="New CV" account={<AccountBar />}>
      <form className={styles.form} onSubmit={onSubmit}>
        {error && sourceProblem === null ? <ErrorNotice messages={error.messages} /> : null}
        {create.error && !error ? (
          <ErrorNotice messages={['Something went wrong. Try again.']} />
        ) : null}

        <TextField
          label="Target role"
          name="targetRole"
          hint="The job you are applying for, for example “Senior Backend Engineer”."
          required
          maxLength={SOURCE_LIMITS.targetRole}
          autoComplete="organization-title"
          enterKeyHint="next"
          error={roleError}
          onChange={() => {
            setRoleError(undefined);
          }}
        />

        <fieldset className={styles.source}>
          <legend className={styles.legend}>Your background</legend>
          <div className={styles.choices}>
            {(
              [
                ['pdf', 'Upload a PDF'],
                ['text', 'Paste or write text'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={styles.choice}>
                <input
                  type="radio"
                  name={sourceGroup}
                  value={value}
                  checked={kind === value}
                  onChange={() => {
                    setKind(value);
                    // The file input is drawn anew and shows no file, so none is kept.
                    setFile(null);
                    setSourceError(null);
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          {kind === 'pdf' ? (
            <div className={styles.file}>
              <label htmlFor={fileId} className={styles.fileLabel}>
                Your CV as a PDF
              </label>
              <p className={styles.hint}>
                Up to 5 MB, with selectable text. A scanned document cannot be read: paste its text
                instead.
              </p>
              <input
                id={fileId}
                type="file"
                accept="application/pdf,.pdf"
                className={styles.fileInput}
                aria-describedby={sourceErrorId}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setSourceError(null);
                }}
              />
            </div>
          ) : (
            <TextArea
              label="Your CV or a description of your background"
              hint={`Free text, in any language. ${text.length.toLocaleString()} of ${SOURCE_LIMITS.text.toLocaleString()} characters.`}
              rows={10}
              maxLength={SOURCE_LIMITS.text}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setSourceError(null);
              }}
            />
          )}
          <p id={sourceErrorId} className={styles.error} role="alert">
            {sourceError ?? sourceProblem}
          </p>
        </fieldset>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" busy={create.isPending}>
            Create CV
          </Button>
          <ButtonLink to="/">Cancel</ButtonLink>
        </div>
      </form>
    </PageShell>
  );
}
