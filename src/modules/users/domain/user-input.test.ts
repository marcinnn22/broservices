import { describe, expect, it } from "vitest";
import { InvalidEmailError, InvalidUserNameError } from "./user.errors.js";
import { normalizeEmail, normalizeUserName } from "./user-input.js";

describe("user input normalization", () => {
  it("normalizes email and display-name whitespace", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(normalizeUserName("  Ada    Lovelace ")).toBe("Ada Lovelace");
  });

  it("rejects invalid values", () => {
    expect(() => normalizeEmail("not-an-email")).toThrow(InvalidEmailError);
    expect(() => normalizeUserName("x")).toThrow(InvalidUserNameError);
    expect(() => normalizeUserName("ab\0cd")).toThrow(InvalidUserNameError);
  });
});
