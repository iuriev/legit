import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import styles from './button.module.css';

type Variant = 'primary' | 'secondary' | 'danger';

const classFor = (variant: Variant, className?: string): string =>
  [styles.button, styles[variant], className].filter(Boolean).join(' ');

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** While an action runs the button is marked busy and cannot be pressed twice. */
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  busy = false,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classFor(variant, rest.className)}
      disabled={rest.disabled ?? busy}
      aria-busy={busy || undefined}
    />
  );
}

/** A link that looks like a button, for navigation. */
export function ButtonLink({ variant = 'secondary', ...rest }: LinkProps & { variant?: Variant }) {
  return <Link {...rest} className={classFor(variant, rest.className)} />;
}
