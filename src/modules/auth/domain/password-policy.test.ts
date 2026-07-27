import { describe, expect, it } from "vitest";
import { WeakPasswordError } from "./auth.errors.js";
import { assertPasswordMeetsPolicy } from "./password-policy.js";

describe("password policy", () => {
  it("accepts a long password containing every required character class", () => {
    expect(() => assertPasswordMeetsPolicy("Correct horse battery staple 7!")).not.toThrow();
  });

  it("rejects short and excessively large passwords", () => {
    expect(() => assertPasswordMeetsPolicy("too short")).toThrow(WeakPasswordError);
    expect(() => assertPasswordMeetsPolicy(`A7!${"🦊".repeat(256)}a`)).toThrow(WeakPasswordError);
  });

  it.each([
    ["lowercase", "UPPERCASE-ONLY-7!"],
    ["uppercase", "lowercase-only-7!"],
    ["number", "Mixed-Case-Only!"],
    ["special character", "MixedCaseOnly77"],
  ])("rejects a password without a %s character class", (_className, password) => {
    expect(() => assertPasswordMeetsPolicy(password)).toThrow(WeakPasswordError);
  });
});
