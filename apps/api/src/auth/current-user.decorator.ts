import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestWithSession, SessionUser } from './session';

/**
 * The signed-in user of a protected route. The session guard has already
 * rejected the request if there is none, so this never yields null; using it
 * on a `@Public()` route is a programming error and fails loudly.
 *
 * The identity always comes from the session cookie, never from the request
 * body or URL.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const { user } = context.switchToHttp().getRequest<RequestWithSession>();
    if (!user) {
      throw new Error('@CurrentUser() used on a route that allows requests without a session');
    }
    return user;
  },
);
