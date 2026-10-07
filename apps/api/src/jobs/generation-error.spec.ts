import { classifyFailure, GenerationError } from './generation-error';

describe('classifyFailure', () => {
  it('keeps the code and the class of a known failure', () => {
    const transient = new GenerationError('service_unavailable', true, 'rate limited');
    const permanent = new GenerationError('no_readable_text', false, 'no citations');

    expect(classifyFailure(transient)).toMatchObject({
      code: 'service_unavailable',
      retryable: true,
    });
    expect(classifyFailure(permanent)).toMatchObject({
      code: 'no_readable_text',
      retryable: false,
    });
  });

  it('treats an unclassified error as transient with a generic code', () => {
    expect(classifyFailure(new TypeError('x is not a function'))).toEqual({
      code: 'generation_failed',
      retryable: true,
      detail: 'TypeError: x is not a function',
    });
    expect(classifyFailure('plain string')).toMatchObject({
      retryable: true,
      detail: 'plain string',
    });
  });

  it('bounds the stored detail', () => {
    expect(classifyFailure(new Error('x'.repeat(5000))).detail).toHaveLength(500);
  });
});
