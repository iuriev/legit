import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import styles from './page-shell.module.css';

interface PageShellProps {
  title: string;
  /** Shown at the end of the header: the account and the way out. */
  account?: ReactNode;
  /** Shown next to the title: the main action of the page. */
  action?: ReactNode;
  children: ReactNode;
}

/** The frame of every page: the name of the product, the account, one title, the content. */
export function PageShell({ title, account, action, children }: PageShellProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · AI CV Builder`;
  }, [title]);
  // A new page starts at its heading, for a keyboard and for a screen reader.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          AI CV Builder
        </Link>
        {account}
      </header>
      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}
