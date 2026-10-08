import type { AuthUser, CredentialsRequest } from '@cv-builder/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '../../components/button';
import { TextField } from '../../components/field';
import { ErrorNotice } from '../../components/notice';
import { PageShell } from '../../components/page-shell';
import { ApiError } from '../../lib/api/client';
import { queryKeys } from '../../lib/api/query-keys';
import { PASSWORD_MIN_LENGTH } from '../../lib/cv-limits';
import styles from './credentials-form.module.css';

interface CredentialsFormProps {
  mode: 'sign-in' | 'sign-up';
  submit: (credentials: CredentialsRequest) => Promise<AuthUser>;
}

/** The value of a text field of a form. */
const textOf = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const TEXT = {
  'sign-in': {
    title: 'Sign in',
    button: 'Sign in',
    other: { question: 'No account yet?', link: 'Create an account', to: '/sign-up' },
  },
  'sign-up': {
    title: 'Create your account',
    button: 'Create account',
    other: { question: 'Already have an account?', link: 'Sign in', to: '/sign-in' },
  },
} as const;

/**
 * The one form behind sign-in and sign-up. The browser does the first round of
 * validation (a required, well-formed email; a password of the right length)
 * and can fill in or suggest the password, because the fields say what they are.
 */
export function CredentialsForm({ mode, submit }: CredentialsFormProps) {
  const text = TEXT[mode];
  const queryClient = useQueryClient();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string>();

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors([]);
    setEmailError(undefined);
    try {
      const user = await submit({
        email: textOf(form, 'email'),
        password: textOf(form, 'password'),
      });
      // Setting the session is all it takes: the page around this form sends a
      // signed-in user on to where they were going.
      queryClient.setQueryData(queryKeys.session, user);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'email_taken') {
        // About the email, so it is said at the email.
        setEmailError(error.messages.join(' '));
      } else {
        setErrors(
          error instanceof ApiError ? error.messages : ['Something went wrong. Try again.'],
        );
      }
      setBusy(false);
    }
  };

  return (
    <PageShell title={text.title}>
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <ErrorNotice messages={errors} />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          spellCheck={false}
          required
          enterKeyHint="next"
          error={emailError}
        />
        <TextField
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          required
          minLength={mode === 'sign-up' ? PASSWORD_MIN_LENGTH : undefined}
          hint={
            mode === 'sign-up' ? `At least ${String(PASSWORD_MIN_LENGTH)} characters.` : undefined
          }
          enterKeyHint="done"
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(event) => {
              setShowPassword(event.target.checked);
            }}
          />
          Show password
        </label>
        <Button type="submit" variant="primary" busy={busy}>
          {text.button}
        </Button>
        <p className={styles.other}>
          {text.other.question} {/* The page the visitor was heading for travels along. */}
          <Link to={text.other.to} state={location.state as unknown}>
            {text.other.link}
          </Link>
        </p>
      </form>
    </PageShell>
  );
}
