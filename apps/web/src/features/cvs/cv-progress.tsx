import type { CvStage } from '@cv-builder/contracts';

import styles from './cv-progress.module.css';
import { STAGES } from './cv-text';

/**
 * What the generation is doing now. The stage comes from the server on every
 * poll; the list only shows where in the sequence it is.
 */
export function CvProgress({ stage }: { stage: CvStage | null }) {
  const current = STAGES.findIndex((item) => item.stage === stage);
  return (
    <section className={styles.progress} aria-labelledby="progress-title">
      <h2 id="progress-title">Building your CV</h2>
      <ol className={styles.stages}>
        {STAGES.map((item, index) => {
          const status = index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <li
              key={item.stage}
              className={styles.stage}
              data-status={status}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <span className={styles.marker} aria-hidden="true" />
              {item.label}
              {status === 'done' ? <span className="visually-hidden"> (done)</span> : null}
            </li>
          );
        })}
      </ol>
      {/* Read out when the stage changes, not on every poll. */}
      <p className="visually-hidden" role="status">
        {STAGES[current]?.label ?? 'Working'}
      </p>
      <p className={styles.note}>
        This usually takes a minute or two. You can close this page or reload it: the work goes on,
        and you will find your CV here when you come back.
      </p>
    </section>
  );
}
