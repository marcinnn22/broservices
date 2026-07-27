import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { type UserRole, userRoles } from "../../../users/index.js";
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssueAccessTokenInput,
} from "../../application/ports/access-token-service.js";

export interface JoseAccessTokenConfig {
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 15 * 60;
const ALGORITHM = "HS256";

export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;
  private readonly ttlSeconds: number;

  constructor(private readonly config: JoseAccessTokenConfig) {
    const secretBytes = new TextEncoder().encode(config.secret);
    if (secretBytes.byteLength < 32) {
      throw new Error("JWT access-token secret must contain at least 32 bytes");
    }

    const ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60) {
      throw new RangeError("JWT access-token TTL must be at least 60 seconds");
    }

    this.key = secretBytes;
    this.ttlSeconds = ttlSeconds;
  }

  async issue(input: IssueAccessTokenInput): Promise<string> {
    const issuedAt = Math.floor(input.issuedAt.getTime() / 1_000);

    return new SignJWT({
      token_use: "access",
      role: input.role,
      auth_version: input.authVersion,
      session_id: input.sessionId,
    })
      .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
      .setSubject(input.userId)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [ALGORITHM],
      });

      if (
        payload.token_use !== "access" ||
        typeof payload.sub !== "string" ||
        !isUserRole(payload.role) ||
        !Number.isSafeInteger(payload.auth_version) ||
        typeof payload.session_id !== "string" ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        return null;
      }

      return {
        userId: payload.sub,
        role: payload.role,
        authVersion: payload.auth_version as number,
        sessionId: payload.session_id,
        issuedAt: new Date(payload.iat * 1_000),
        expiresAt: new Date(payload.exp * 1_000),
      };
    } catch {
      return null;
    }
  }
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.includes(value as UserRole);
}
