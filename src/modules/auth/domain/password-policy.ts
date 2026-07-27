import { WeakPasswordError } from "./auth.errors.js";

export const passwordPolicy = {
  minCharacters: 12,
  maxUtf8Bytes: 1_024,
  requiresLowercase: true,
  requiresUppercase: true,
  requiresNumber: true,
  requiresSpecialCharacter: true,
} as const;

const COMMON_PASSWORDS = new Set(["123456789012", "password1234", "qwerty123456", "letmein123456"]);

const requiredCharacterClasses = [
  { pattern: /\p{Ll}/u, label: "lowercase letter" },
  { pattern: /\p{Lu}/u, label: "uppercase letter" },
  { pattern: /\p{N}/u, label: "number" },
  { pattern: /[^\p{L}\p{N}\s]/u, label: "special character" },
] as const;

export function assertPasswordMeetsPolicy(password: string): void {
  if (password.length < passwordPolicy.minCharacters) {
    throw new WeakPasswordError(
      `Password must contain at least ${passwordPolicy.minCharacters} characters`,
    );
  }

  const bytes = new TextEncoder().encode(password).byteLength;
  if (bytes > passwordPolicy.maxUtf8Bytes) {
    throw new WeakPasswordError(
      `Password must not exceed ${passwordPolicy.maxUtf8Bytes} UTF-8 bytes`,
    );
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new WeakPasswordError("Choose a less common password");
  }

  const missingClasses = requiredCharacterClasses
    .filter(({ pattern }) => !pattern.test(password))
    .map(({ label }) => label);

  if (missingClasses.length > 0) {
    throw new WeakPasswordError(
      `Password must contain at least one lowercase letter, uppercase letter, number, and special character`,
    );
  }
}
