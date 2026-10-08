import type { ReactNode } from 'react';

import styles from './notice.module.css';

type Kind = 'info' | 'success' | 'warning' | 'error';

/**
 * A message about what happened. An error is an alert, read out at once; the
 * others are a status, read out when the reader is idle.
 */
export function Notice({ kind = 'info', children }: { kind?: Kind; children: ReactNode }) {
  return (
    <div
      className={[styles.notice, styles[kind]].join(' ')}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

/** The messages of a failed request, as text. */
export function ErrorNotice({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }
  return (
    <Notice kind="error">
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : (
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </Notice>
  );
}
