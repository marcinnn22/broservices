import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./argon2-password-hasher.js";
import { JoseAccessTokenService } from "./jose-access-token-service.js";
import { NodeOpaqueTokenService } from "./node-opaque-token-service.js";

describe("security adapters", () => {
  it("hashes and verifies passwords without returning the password", async () => {
    const hasher = new Argon2PasswordHasher({
      memoryCostKiB: 8_192,
      timeCost: 1,
      parallelism: 1,
    });
    const password = "correct horse battery staple";
    const passwordHash = await hasher.hash(password);

    expect(passwordHash).not.toContain(password);
    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    await expect(hasher.verify(password, passwordHash)).resolves.toBe(true);
    await expect(hasher.verify("a different password", passwordHash)).resolves.toBe(false);
    await expect(hasher.verify(password, null)).resolves.toBe(false);
  });

  it("rejects unsafe Argon2 parameter ranges before hashing", () => {
    expect(() => new Argon2PasswordHasher({ memoryCostKiB: 4_096 })).toThrow(RangeError);
    expect(() => new Argon2PasswordHasher({ timeCost: 0 })).toThrow(RangeError);
    expect(() => new Argon2PasswordHasher({ parallelism: 0 })).toThrow(RangeError);
  });

  it("issues namespaced opaque tokens and stable SHA-256 hashes", () => {
    const tokens = new NodeOpaqueTokenService();
    const first = tokens.issue("refresh");
    const second = tokens.issue("refresh");

    expect(first.value).toMatch(/^rt_[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(first.value)).toBe(first.hash);
    expect(second.value).not.toBe(first.value);
    expect(second.hash).not.toBe(first.hash);
  });

  it("round-trips only valid access-token claims", async () => {
    const accessTokens = new JoseAccessTokenService({
      secret: "test-only-secret-with-at-least-thirty-two-bytes",
      issuer: "test-suite",
      audience: "test-api",
      ttlSeconds: 300,
    });
    const issuedAt = new Date();
    const token = await accessTokens.issue({
      userId: "7e71edcc-e74c-4a76-9e8b-b2c9687c5267",
      role: "admin",
      authVersion: 3,
      sessionId: "4ca35c61-8b4d-42e7-8869-77d6fb77eff0",
      issuedAt,
    });

    const claims = await accessTokens.verify(token);
    expect(claims).toMatchObject({
      userId: "7e71edcc-e74c-4a76-9e8b-b2c9687c5267",
      role: "admin",
      authVersion: 3,
      sessionId: "4ca35c61-8b4d-42e7-8869-77d6fb77eff0",
    });

    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) {
      throw new Error("Issued access token is not a compact JWT");
    }

    const tamperedSignature = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
    const tampered = `${header}.${payload}.${tamperedSignature}`;
    await expect(accessTokens.verify(tampered)).resolves.toBeNull();
  });
});
