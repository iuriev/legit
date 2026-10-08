import type { Cv, CvContact, CvDocument, CvEducation, CvExperience } from '@cv-builder/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { TextArea, TextField } from '../../components/field';
import { ErrorNotice, Notice } from '../../components/notice';
import { ApiError } from '../../lib/api/client';
import { cvsService } from '../../lib/api/cvs-service';
import { queryKeys } from '../../lib/api/query-keys';
import { CV_LIMITS } from '../../lib/cv-limits';
import { unsavedChanges } from '../../lib/unsaved-changes';
import { emptyEducation, emptyExperience, listProblems, sameDocument, tidy } from './cv-document';
import styles from './cv-editor.module.css';
import { DeleteCvButton } from './delete-cv';

type ReadyCv = Cv & { document: CvDocument };

/** What the server holds: the document and the version a save must be based on. */
interface Saved {
  document: CvDocument;
  version: number;
}

const lines = (text: string): string[] => text.split('\n');

/**
 * Puts the focus where the user will go on working, once React has drawn the
 * change: on the field a button has just added, or, after a button removed its
 * own item, on the button that adds one. Without this the focus is left on
 * nothing and a keyboard user starts again from the top of the page.
 */
function focusNext(find: () => HTMLElement | null | undefined): void {
  requestAnimationFrame(() => find()?.focus());
}

/**
 * The CV as a form. Every field can be changed, entries and bullet points can
 * be added and removed, and nothing reaches the server until the owner saves.
 *
 * A save states the version it was based on. If the CV was saved somewhere
 * else in the meantime the server refuses, and the editor says so and offers
 * the current version instead of overwriting it.
 */
export function CvEditor({ cv, onDeleted }: { cv: ReadyCv; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState<Saved>({ document: cv.document, version: cv.version });
  const [draft, setDraft] = useState<CvDocument>(cv.document);
  const [conflict, setConflict] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [checked, setChecked] = useState(false);

  const dirty = !sameDocument(draft, saved.document);
  const problems = listProblems(tidy(draft));

  // Others that could take the user away from the page (sign-out, an ended
  // session) look here before they do.
  useEffect(() => {
    unsavedChanges.present = dirty;
    return () => {
      unsavedChanges.present = false;
    };
  }, [dirty]);

  const save = useMutation({
    mutationFn: async () => {
      const document = tidy(draft);
      const result = await cvsService.save(cv.id, saved.version, document);
      return { document, ...result };
    },
    onSuccess: ({ document, version, updatedAt }) => {
      setSaved({ document, version });
      // The fields take the tidied text, unless the user typed on while the
      // save was under way: then what they typed stays, as unsaved changes.
      setDraft((current) => (sameDocument(current, document) ? document : current));
      setConflict(false);
      setJustSaved(true);
      queryClient.setQueryData<Cv>(queryKeys.cv(cv.id), (current) =>
        current ? { ...current, document, version, updatedAt } : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.cvs, exact: true });
    },
    onError: (error) => {
      setConflict(error instanceof ApiError && error.code === 'version_conflict');
    },
  });

  const loadCurrent = useMutation({
    mutationFn: () => cvsService.get(cv.id),
    onSuccess: (current) => {
      queryClient.setQueryData(queryKeys.cv(cv.id), current);
      if (current.document) {
        setSaved({ document: current.document, version: current.version });
        setDraft(current.document);
      }
      setConflict(false);
      save.reset();
    },
  });

  const download = useMutation({
    mutationFn: () => cvsService.pdf(cv.id),
    onSuccess: ({ file, name }) => {
      // Handed to the browser as a file; the page is never left.
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  // Closing the tab or reloading with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);
  // So does moving to another page of the application.
  const blocker = useBlocker(() => dirty && !unsavedChanges.leaving);

  const change = (update: (document: CvDocument) => CvDocument) => {
    setJustSaved(false);
    setDraft(update);
  };
  const setContact = (patch: Partial<CvContact>) => {
    change((d) => ({ ...d, contact: { ...d.contact, ...patch } }));
  };
  const setExperience = (index: number, patch: Partial<CvExperience>) => {
    change((d) => ({
      ...d,
      experience: d.experience.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };
  const setEducation = (index: number, patch: Partial<CvEducation>) => {
    change((d) => ({
      ...d,
      education: d.education.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };

  /** Whether the form may be sent: the browser's checks, and ours for the two lists. */
  const valid = (): boolean => {
    setChecked(true);
    return (form.current?.reportValidity() ?? true) && !problems.links && !problems.skills;
  };
  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (valid()) {
      save.mutate();
    }
  };
  /** The file must show what is on the screen, so pending changes are saved first. */
  const saveThenDownload = async () => {
    if (dirty) {
      if (!valid()) {
        return;
      }
      try {
        await save.mutateAsync();
      } catch {
        return;
      }
    }
    download.mutate();
  };

  const working = save.isPending || download.isPending;
  const saveError = save.error && !conflict ? save.error : null;
  const sessionEnded = [save.error, download.error, loadCurrent.error].some(
    (error) => error instanceof ApiError && error.status === 401,
  );

  return (
    <form ref={form} className={styles.editor} onSubmit={onSubmit}>
      {cv.omittedCount > 0 ? (
        <Notice kind="warning">
          <p>
            {cv.omittedCount === 1 ? 'One item was' : `${String(cv.omittedCount)} items were`} left
            out when this CV was written, because {cv.omittedCount === 1 ? 'it' : 'they'} could not
            be verified against what you provided. Read it through and add by hand anything that is
            missing.
          </p>
        </Notice>
      ) : null}

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Contact details</legend>
        <TextField
          label="Full name"
          autoComplete="name"
          maxLength={CV_LIMITS.shortText}
          value={draft.contact.fullName}
          onChange={(event) => {
            setContact({ fullName: event.target.value });
          }}
        />
        <div className={styles.pair}>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={CV_LIMITS.shortText}
            value={draft.contact.email}
            onChange={(event) => {
              setContact({ email: event.target.value });
            }}
          />
          <TextField
            label="Phone"
            type="tel"
            autoComplete="tel"
            maxLength={CV_LIMITS.shortText}
            value={draft.contact.phone}
            onChange={(event) => {
              setContact({ phone: event.target.value });
            }}
          />
        </div>
        <TextField
          label="Location"
          autoComplete="address-level2"
          maxLength={CV_LIMITS.shortText}
          value={draft.contact.location}
          onChange={(event) => {
            setContact({ location: event.target.value });
          }}
        />
        <TextArea
          label="Links"
          hint="One per line, for example your LinkedIn or GitHub profile."
          rows={2}
          spellCheck={false}
          autoCapitalize="off"
          error={checked ? problems.links : undefined}
          value={draft.contact.links.join('\n')}
          onChange={(event) => {
            setContact({ links: lines(event.target.value) });
          }}
        />
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Summary</legend>
        <TextArea
          label="Summary"
          rows={5}
          maxLength={CV_LIMITS.summary}
          value={draft.summary}
          onChange={(event) => {
            change((d) => ({ ...d, summary: event.target.value }));
          }}
        />
      </fieldset>

      <fieldset className={styles.section} data-group>
        <legend className={styles.sectionTitle}>Experience</legend>
        {draft.experience.map((entry, index) => (
          // The entries have no identity of their own; every field is controlled, so the index is a safe key.
          <fieldset key={index} className={styles.entry} data-entry>
            <legend className={styles.entryTitle}>
              {entry.title || entry.company || `Position ${String(index + 1)}`}
            </legend>
            <div className={styles.pair}>
              <TextField
                label="Job title"
                maxLength={CV_LIMITS.shortText}
                value={entry.title}
                onChange={(event) => {
                  setExperience(index, { title: event.target.value });
                }}
              />
              <TextField
                label="Employer"
                maxLength={CV_LIMITS.shortText}
                value={entry.company}
                onChange={(event) => {
                  setExperience(index, { company: event.target.value });
                }}
              />
            </div>
            <div className={styles.triple}>
              <TextField
                label="Start"
                maxLength={CV_LIMITS.shortText}
                value={entry.startDate}
                onChange={(event) => {
                  setExperience(index, { startDate: event.target.value });
                }}
              />
              <TextField
                label="End"
                maxLength={CV_LIMITS.shortText}
                value={entry.endDate}
                onChange={(event) => {
                  setExperience(index, { endDate: event.target.value });
                }}
              />
              <TextField
                label="Location"
                maxLength={CV_LIMITS.shortText}
                value={entry.location}
                onChange={(event) => {
                  setExperience(index, { location: event.target.value });
                }}
              />
            </div>
            {entry.bullets.map((bullet, bulletIndex) => (
              <div key={bulletIndex} className={styles.bullet}>
                <TextArea
                  label={`Bullet point ${String(bulletIndex + 1)}`}
                  data-bullet
                  rows={2}
                  maxLength={CV_LIMITS.bullet}
                  value={bullet}
                  onChange={(event) => {
                    setExperience(index, {
                      bullets: entry.bullets.map((b, i) =>
                        i === bulletIndex ? event.target.value : b,
                      ),
                    });
                  }}
                />
                <Button
                  onClick={(event) => {
                    const position = event.currentTarget.closest('[data-entry]');
                    setExperience(index, {
                      bullets: entry.bullets.filter((_b, i) => i !== bulletIndex),
                    });
                    focusNext(() => position?.querySelector<HTMLElement>('[data-add="bullet"]'));
                  }}
                >
                  Remove<span className="visually-hidden"> bullet point {bulletIndex + 1}</span>
                </Button>
              </div>
            ))}
            <div className={styles.entryActions}>
              <Button
                data-add="bullet"
                disabled={entry.bullets.length >= CV_LIMITS.bullets}
                onClick={(event) => {
                  const position = event.currentTarget.closest('[data-entry]');
                  setExperience(index, { bullets: [...entry.bullets, ''] });
                  focusNext(() =>
                    [...(position?.querySelectorAll<HTMLElement>('[data-bullet]') ?? [])].at(-1),
                  );
                }}
              >
                Add bullet point
              </Button>
              <Button
                variant="danger"
                onClick={(event) => {
                  const group = event.currentTarget.closest('[data-group]');
                  change((d) => ({
                    ...d,
                    experience: d.experience.filter((_e, i) => i !== index),
                  }));
                  focusNext(() => group?.querySelector<HTMLElement>('[data-add="entry"]'));
                }}
              >
                Remove position
              </Button>
            </div>
          </fieldset>
        ))}
        <div>
          <Button
            data-add="entry"
            disabled={draft.experience.length >= CV_LIMITS.experience}
            onClick={(event) => {
              const group = event.currentTarget.closest('[data-group]');
              change((d) => ({ ...d, experience: [...d.experience, emptyExperience()] }));
              focusNext(() =>
                [...(group?.querySelectorAll<HTMLElement>('[data-entry]') ?? [])]
                  .at(-1)
                  ?.querySelector('input'),
              );
            }}
          >
            Add position
          </Button>
        </div>
      </fieldset>

      <fieldset className={styles.section} data-group>
        <legend className={styles.sectionTitle}>Education</legend>
        {draft.education.map((entry, index) => (
          <fieldset key={index} className={styles.entry} data-entry>
            <legend className={styles.entryTitle}>
              {entry.degree || entry.institution || `Education ${String(index + 1)}`}
            </legend>
            <div className={styles.pair}>
              <TextField
                label="Degree or certificate"
                maxLength={CV_LIMITS.shortText}
                value={entry.degree}
                onChange={(event) => {
                  setEducation(index, { degree: event.target.value });
                }}
              />
              <TextField
                label="Institution"
                maxLength={CV_LIMITS.shortText}
                value={entry.institution}
                onChange={(event) => {
                  setEducation(index, { institution: event.target.value });
                }}
              />
            </div>
            <div className={styles.pair}>
              <TextField
                label="Start"
                maxLength={CV_LIMITS.shortText}
                value={entry.startDate}
                onChange={(event) => {
                  setEducation(index, { startDate: event.target.value });
                }}
              />
              <TextField
                label="End"
                maxLength={CV_LIMITS.shortText}
                value={entry.endDate}
                onChange={(event) => {
                  setEducation(index, { endDate: event.target.value });
                }}
              />
            </div>
            <TextArea
              label="Details"
              rows={2}
              maxLength={CV_LIMITS.details}
              value={entry.details}
              onChange={(event) => {
                setEducation(index, { details: event.target.value });
              }}
            />
            <div className={styles.entryActions}>
              <Button
                variant="danger"
                onClick={(event) => {
                  const group = event.currentTarget.closest('[data-group]');
                  change((d) => ({ ...d, education: d.education.filter((_e, i) => i !== index) }));
                  focusNext(() => group?.querySelector<HTMLElement>('[data-add="entry"]'));
                }}
              >
                Remove education
              </Button>
            </div>
          </fieldset>
        ))}
        <div>
          <Button
            data-add="entry"
            disabled={draft.education.length >= CV_LIMITS.education}
            onClick={(event) => {
              const group = event.currentTarget.closest('[data-group]');
              change((d) => ({ ...d, education: [...d.education, emptyEducation()] }));
              focusNext(() =>
                [...(group?.querySelectorAll<HTMLElement>('[data-entry]') ?? [])]
                  .at(-1)
                  ?.querySelector('input'),
              );
            }}
          >
            Add education
          </Button>
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Skills</legend>
        <TextArea
          label="Skills"
          hint="One per line."
          rows={6}
          error={checked ? problems.skills : undefined}
          value={draft.skills.join('\n')}
          onChange={(event) => {
            change((d) => ({ ...d, skills: lines(event.target.value) }));
          }}
        />
      </fieldset>

      <div className={styles.remove}>
        <DeleteCvButton
          id={cv.id}
          targetRole={cv.targetRole}
          onDeleted={() => {
            // Nothing is left to keep, so leaving needs no question.
            unsavedChanges.leaving = true;
            onDeleted();
            unsavedChanges.leaving = false;
          }}
        />
      </div>

      {/* What went wrong is said where the button was pressed, not at the far end of the form. */}
      <div className={styles.bar}>
        {conflict ? (
          <Notice kind="error">
            <p>
              This CV was changed somewhere else after you opened it, so your changes were not
              saved. Loading the current version replaces what you have typed here.
            </p>
            <div>
              <Button
                busy={loadCurrent.isPending}
                onClick={() => {
                  loadCurrent.mutate();
                }}
              >
                Load the current version
              </Button>
            </div>
          </Notice>
        ) : null}
        {sessionEnded ? (
          <Notice kind="error">
            <p>
              You are no longer signed in. Your changes are still here: sign in again in another
              tab, then come back and save.
            </p>
          </Notice>
        ) : (
          <>
            {saveError ? (
              <ErrorNotice
                messages={
                  saveError instanceof ApiError
                    ? ['Your changes were not saved.', ...saveError.messages]
                    : ['Your changes could not be saved. Try again.']
                }
              />
            ) : null}
            {download.error ? (
              <ErrorNotice
                messages={
                  download.error instanceof ApiError
                    ? download.error.messages
                    : ['The PDF could not be downloaded. Try again.']
                }
              />
            ) : null}
            {loadCurrent.error ? (
              <ErrorNotice messages={['The current version could not be loaded. Try again.']} />
            ) : null}
          </>
        )}
        <div className={styles.barRow}>
          <p className={styles.status} role="status">
            {dirty ? 'Unsaved changes' : justSaved ? 'Saved' : 'No unsaved changes'}
          </p>
          <div className={styles.barActions}>
            <Button
              type="submit"
              variant="primary"
              busy={save.isPending}
              disabled={!dirty || working}
            >
              Save
            </Button>
            {/* With unsaved changes this saves first, so the file shows what is on the screen. */}
            <Button
              busy={download.isPending}
              disabled={working}
              onClick={() => {
                void saveThenDownload();
              }}
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        <p>Your changes to this CV have not been saved and will be lost.</p>
      </ConfirmDialog>
    </form>
  );
}
