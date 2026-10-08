import type {
  CreateCvResponse,
  Cv,
  CvDocument,
  CvSummary,
  SaveCvRequest,
  SaveCvResponse,
  SubmitAnswersRequest,
  SubmittedAnswer,
} from '@cv-builder/contracts';

import { ApiError, request, sendJson } from './client';

export type NewCvSource = { kind: 'pdf'; file: File } | { kind: 'text'; text: string };

export const cvsService = {
  list: (): Promise<CvSummary[]> => request('/api/cvs'),

  get: (id: string): Promise<Cv> => request(`/api/cvs/${encodeURIComponent(id)}`),

  async create(targetRole: string, source: NewCvSource): Promise<string> {
    const form = new FormData();
    form.set('targetRole', targetRole);
    if (source.kind === 'pdf') {
      form.set('file', source.file);
    } else {
      form.set('text', source.text);
    }
    // No Content-Type header: the browser writes the multipart boundary itself.
    return (await request<CreateCvResponse>('/api/cvs', { method: 'POST', body: form })).id;
  },

  answer: (id: string, answers: SubmittedAnswer[]): Promise<void> =>
    sendJson('POST', `/api/cvs/${encodeURIComponent(id)}/answers`, {
      answers,
    } satisfies SubmitAnswersRequest),

  retry: (id: string): Promise<void> =>
    request(`/api/cvs/${encodeURIComponent(id)}/retry`, { method: 'POST' }),

  save: (id: string, version: number, document: CvDocument): Promise<SaveCvResponse> =>
    sendJson('PUT', `/api/cvs/${encodeURIComponent(id)}`, {
      version,
      document,
    } satisfies SaveCvRequest),

  remove: (id: string): Promise<void> =>
    request(`/api/cvs/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * The PDF of the saved CV, with the name the server gives the file. Fetched
   * rather than opened as a link, so that a failure is shown by the page and
   * the page itself is never left.
   */
  async pdf(id: string): Promise<{ file: Blob; name: string }> {
    let response: Response;
    try {
      response = await fetch(`/api/cvs/${encodeURIComponent(id)}/pdf`, {
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError(0, 'network_error', [
        'Could not reach the server. Check your connection.',
      ]);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message =
        typeof body?.message === 'string' ? body.message : 'The PDF could not be made.';
      throw new ApiError(
        response.status,
        response.status === 401 ? 'unauthenticated' : 'internal_error',
        [message],
      );
    }
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(
      response.headers.get('Content-Disposition') ?? '',
    );
    let name = 'CV.pdf';
    try {
      name = encoded?.[1] ? decodeURIComponent(encoded[1]) : name;
    } catch {
      // Keep the plain name.
    }
    return { file: await response.blob(), name };
  },
};
