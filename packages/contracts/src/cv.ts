export interface CvContact {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface CvExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface CvEducation {
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
  details: string;
}

/**
 * The content of a CV. Every field is optional: an empty string or an empty
 * list means "nothing to show", and the PDF leaves it out.
 */
export interface CvDocument {
  contact: CvContact;
  summary: string;
  experience: CvExperience[];
  education: CvEducation[];
  skills: string[];
}

export type CvSection = 'contact' | 'summary' | 'experience' | 'education' | 'skills';

/** What the owner sees: the CV is being generated, waits for answers, is ready or failed. */
export type CvState = 'generating' | 'awaiting_answers' | 'ready' | 'failed';

/** What generation is doing right now. Present only while the state is `generating`. */
export type CvStage = 'reading' | 'questions' | 'writing' | 'checking';

export type CvFailureCode =
  | 'service_unavailable'
  | 'generation_failed'
  | 'ai_not_configured'
  | 'declined'
  | 'no_readable_text'
  | 'source_too_long';

export interface CvFailure {
  code: CvFailureCode;
  /** A reason in plain language. */
  message: string;
  /** Whether `POST /api/cvs/:id/retry` can restart the generation. */
  retryable: boolean;
}

export interface CvQuestion {
  id: string;
  section: CvSection;
  text: string;
}

/** An item of `GET /api/cvs`. */
export interface CvSummary {
  id: string;
  targetRole: string;
  state: CvState;
  createdAt: string;
  updatedAt: string;
}

/** Response of `GET /api/cvs/:id`. */
export interface Cv extends CvSummary {
  stage: CvStage | null;
  failure: CvFailure | null;
  /** The questions to answer. Empty unless the state is `awaiting_answers`. */
  questions: CvQuestion[];
  /** The content. Null until the state is `ready`. */
  document: CvDocument | null;
  /** How many generated items were left out because they could not be verified. */
  omittedCount: number;
  /** The version a save must be based on. */
  version: number;
}

/** Response of `POST /api/cvs`. The request is multipart: `targetRole` and either `file` or `text`. */
export interface CreateCvResponse {
  id: string;
}
