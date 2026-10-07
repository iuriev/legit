import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a session. Every route is protected
 * unless it says otherwise. A valid session is still recognised on a public
 * route, so a handler can treat signed-in callers differently.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
