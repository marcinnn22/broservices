import { normalizeEmail, toUserView, type UserRepository } from "../../../users/index.js";
import {
  AccountDisabledError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
} from "../../domain/auth.errors.js";
import type { SessionMetadata } from "../../domain/refresh-session.js";
import type { AuthSessionResult } from "../auth.types.js";
import { expiresAfter } from "../auth-lifetimes.js";
import type { AccessTokenService } from "../ports/access-token-service.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";
import type { PasswordHasher } from "../ports/password-hasher.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";
import { normalizeSessionMetadata } from "../session-metadata.js";

export interface LoginInput extends SessionMetadata {
  email: string;
  password: string;
}

export interface LoginDependencies {
  users: UserRepository;
  passwords: PasswordHasher;
  accessTokens: AccessTokenService;
  opaqueTokens: OpaqueTokenService;
  sessions: RefreshSessionRepository;
  ids: IdGenerator;
  clock: Clock;
  refreshSessionMs: number;
}

export class Login {
  constructor(private readonly dependencies: LoginDependencies) {}

  async execute(input: LoginInput): Promise<AuthSessionResult> {
    const email = normalizeLoginEmail(input.email);
    const credentials = await this.dependencies.users.findCredentialsByEmail(email);
    const passwordIsValid = await this.dependencies.passwords.verify(
      input.password,
      credentials?.passwordHash ?? null,
    );

    if (!credentials || !passwordIsValid) {
      throw new InvalidCredentialsError();
    }

    const { user } = credentials;
    if (user.status !== "active") {
      throw new AccountDisabledError();
    }

    if (!user.emailVerifiedAt) {
      throw new EmailNotVerifiedError();
    }

    const now = this.dependencies.clock.now();
    const expiresAt = expiresAfter(now, this.dependencies.refreshSessionMs);
    const refreshToken = this.dependencies.opaqueTokens.issue("refresh");
    const sessionId = this.dependencies.ids.generate();

    const accessToken = await this.dependencies.accessTokens.issue({
      userId: user.id,
      role: user.role,
      authVersion: user.authVersion,
      sessionId,
      issuedAt: now,
    });

    await this.dependencies.sessions.create({
      id: sessionId,
      userId: user.id,
      familyId: this.dependencies.ids.generate(),
      tokenHash: refreshToken.hash,
      authVersion: user.authVersion,
      expiresAt,
      createdAt: now,
      ...normalizeSessionMetadata(input),
    });

    return {
      user: toUserView(user),
      accessToken,
      refreshToken: refreshToken.value,
      refreshTokenExpiresAt: expiresAt,
    };
  }
}

function normalizeLoginEmail(value: string): string {
  try {
    return normalizeEmail(value);
  } catch {
    throw new InvalidCredentialsError();
  }
}
