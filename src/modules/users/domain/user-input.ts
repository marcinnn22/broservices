import { InvalidEmailError, InvalidUserNameError } from "./user.errors.js";

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_EMAIL_LENGTH ||
    !SIMPLE_EMAIL_PATTERN.test(normalized)
  ) {
    throw new InvalidEmailError();
  }

  return normalized;
}

export function normalizeUserName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");

  if (
    normalized.includes("\0") ||
    normalized.length < MIN_NAME_LENGTH ||
    normalized.length > MAX_NAME_LENGTH
  ) {
    throw new InvalidUserNameError();
  }

  return normalized;
}
