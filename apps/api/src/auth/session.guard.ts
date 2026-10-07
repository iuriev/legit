import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';

import { IS_PUBLIC_KEY } from './public.decorator';
import {
  type RequestWithSession,
  SESSION_COOKIE,
  type SessionPayload,
  type SessionUser,
} from './session';

/**
 * Applied to every route. Reads the session cookie, attaches the user to the
 * request when the token is valid, and rejects the request unless the route is
 * marked `@Public()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const user = await this.readSession(request);
    request.user = user ?? undefined;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || user) {
      return true;
    }
    throw new UnauthorizedException('Sign in to continue');
  }

  private async readSession(request: RequestWithSession): Promise<SessionUser | null> {
    const token = (request.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') {
      return null;
    }
    try {
      const payload = await this.jwtService.verifyAsync<SessionPayload>(token);
      return isUUID(payload.sub) ? { id: payload.sub } : null;
    } catch {
      // Expired, malformed or signed with another key: the same as no session.
      return null;
    }
  }
}
