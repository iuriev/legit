import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

import styles from './field.module.css';

interface FieldProps {
  label: string;
  /** Help that is always shown under the label. */
  hint?: ReactNode;
  /** A problem with the value, shown and announced when present. */
  error?: string;
}

interface Described {
  id: string;
  describedBy: string | undefined;
  invalid: true | undefined;
}

/**
 * A label above its control, with an optional hint and error under it. The
 * control is tied to both through `aria-describedby`, and the error is in an
 * alert region so that it is read out when it appears.
 */
function Field({
  label,
  hint,
  error,
  children,
}: FieldProps & { children: (described: Described) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy: describedBy || undefined, invalid: error ? true : undefined })}
      <p id={errorId} className={styles.error} role="alert">
        {error}
      </p>
    </div>
  );
}

type TextFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

export function TextField({ label, hint, error, ...input }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          type="text"
          {...input}
          id={id}
          className={styles.control}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      )}
    </Field>
  );
}

type TextAreaProps = FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>;

export function TextArea({ label, hint, error, rows = 3, ...textarea }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea
          {...textarea}
          id={id}
          rows={rows}
          className={styles.control}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      )}
    </Field>
  );
}
