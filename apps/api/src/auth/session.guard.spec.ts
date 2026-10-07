import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { IS_PUBLIC_KEY } from './public.decorator';
import type { RequestWithSession } from './session';
import { SessionGuard } from './session.guard';

const USER_ID = '0b9f6f0e-3a51-4c0e-9d1b-6a8f0f5f2c11';

// Stand-ins for route handlers: the guard only reads their metadata.
const handlers = {
  protectedRoute: () => undefined,
  publicRoute: () => undefined,
};
Reflect.defineMetadata(IS_PUBLIC_KEY, true, handlers.publicRoute);

describe('SessionGuard', () => {
  const jwtService = new JwtService({ secret: 'unit-test-secret-unit-test-secret-012' });
  const guard = new SessionGuard(new Reflector(), jwtService);

  const run = async (handler: 'protectedRoute' | 'publicRoute', cookie?: string) => {
    const request = { cookies: cookie ? { session: cookie } : {} } as RequestWithSession;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handlers[handler],
      getClass: () => Object,
    } as unknown as ExecutionContext;
    return { allowed: await guard.canActivate(context), request };
  };

  it('denies a route that is not marked public when there is no session', async () => {
    await expect(run('protectedRoute')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies a protected route for an invalid token', async () => {
    await expect(run('protectedRoute', 'not-a-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows a protected route with a valid session and exposes the user', async () => {
    const token = await jwtService.signAsync({ sub: USER_ID });

    const { allowed, request } = await run('protectedRoute', token);

    expect(allowed).toBe(true);
    expect(request.user).toEqual({ id: USER_ID });
  });

  it('allows a public route without a session', async () => {
    const { allowed, request } = await run('publicRoute');

    expect(allowed).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('recognises a valid session on a public route', async () => {
    const token = await jwtService.signAsync({ sub: USER_ID });

    expect((await run('publicRoute', token)).request.user).toEqual({ id: USER_ID });
  });

  it('ignores an invalid token on a public route instead of rejecting the request', async () => {
    const { allowed, request } = await run('publicRoute', 'not-a-token');

    expect(allowed).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
