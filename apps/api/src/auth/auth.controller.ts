import type { AuthResponse } from '@cv-builder/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, RegisterDto } from './dto/credentials.dto';
import { Public } from './public.decorator';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionUser } from './session';

/**
 * Page scripts cannot read the cookie, and the browser does not send it with
 * cross-site requests that change data. It is marked Secure whenever the
 * request arrived over HTTPS.
 */
function cookieOptions(request: Request): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: request.secure, path: '/' };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(body);
    this.startSession(request, response, result.sessionToken);
    return { user: result.user };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(body);
    this.startSession(request, response, result.sessionToken);
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, cookieOptions(request));
  }

  @Get('me')
  async me(@CurrentUser() user: SessionUser): Promise<AuthResponse> {
    return { user: await this.authService.getUser(user.id) };
  }

  private startSession(request: Request, response: Response, sessionToken: string): void {
    response.cookie(SESSION_COOKIE, sessionToken, {
      ...cookieOptions(request),
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
  }
}
