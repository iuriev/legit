import type { AuthUser, CredentialsRequest } from '@cv-builder/contracts';
import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { DataSource } from 'typeorm';

import { ApiException } from '../common/api.exception';
import type { Env } from '../config/env';
import { isUniqueViolation } from '../database/pg-errors';
import { User } from '../users/user.entity';
import { PASSWORD_MAX_LENGTH } from './dto/credentials.dto';
import type { SessionPayload } from './session';

export interface AuthResult {
  user: AuthUser;
  sessionToken: string;
}

@Injectable()
export class AuthService {
  private readonly bcryptRounds: number;
  /** Compared against when the email is unknown, so both failures cost one bcrypt comparison. */
  private readonly decoyHash: Promise<string>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.bcryptRounds = config.get('BCRYPT_ROUNDS', { infer: true });
    this.decoyHash = hash('decoy-password-never-matches', this.bcryptRounds);
  }

  async register(request: CredentialsRequest): Promise<AuthResult> {
    const passwordHash = await hash(request.password, this.bcryptRounds);
    try {
      // The unique constraint decides, not a lookup before the insert, so two
      // simultaneous registrations of one email cannot both succeed.
      const user = await this.dataSource
        .getRepository(User)
        .save({ email: request.email, passwordHash });
      return await this.buildResult(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'email_taken',
          'An account with this email already exists. Sign in instead.',
        );
      }
      throw error;
    }
  }

  async login(request: CredentialsRequest): Promise<AuthResult> {
    const user = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: request.email })
      .getOne();
    const passwordMatches = await compare(
      request.password,
      user?.passwordHash ?? (await this.decoyHash),
    );
    // bcrypt compares only the first 72 bytes, and no stored password is
    // longer, so a longer one is wrong even when its beginning matches.
    const tooLong = Buffer.byteLength(request.password) > PASSWORD_MAX_LENGTH;
    if (!user || !passwordMatches || tooLong) {
      // The same response for an unknown email and a wrong password.
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'invalid_credentials',
        'Invalid email or password.',
      );
    }
    return this.buildResult(user);
  }

  async getUser(userId: string): Promise<AuthUser> {
    const user = await this.dataSource.getRepository(User).findOneBy({ id: userId });
    if (!user) {
      // A valid token for an account that no longer exists.
      throw new UnauthorizedException('Sign in to continue');
    }
    return { id: user.id, email: user.email };
  }

  private async buildResult(user: User): Promise<AuthResult> {
    const payload: SessionPayload = { sub: user.id };
    return {
      user: { id: user.id, email: user.email },
      sessionToken: await this.jwtService.signAsync(payload),
    };
  }
}
