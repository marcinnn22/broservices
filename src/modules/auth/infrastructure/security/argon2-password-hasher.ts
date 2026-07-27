import { hash, type Options, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../../application/ports/password-hasher.js";

export interface Argon2PasswordHasherOptions {
  readonly memoryCostKiB?: number;
  readonly timeCost?: number;
  readonly parallelism?: number;
}

const defaults = {
  memoryCostKiB: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  private readonly options: Readonly<Options>;

  constructor(options: Argon2PasswordHasherOptions = {}) {
    const memoryCostKiB = options.memoryCostKiB ?? defaults.memoryCostKiB;
    const timeCost = options.timeCost ?? defaults.timeCost;
    const parallelism = options.parallelism ?? defaults.parallelism;

    assertIntegerInRange(memoryCostKiB, 8_192, 1_048_576, "Argon2 memory cost");
    assertIntegerInRange(timeCost, 1, 10, "Argon2 time cost");
    assertIntegerInRange(parallelism, 1, 16, "Argon2 parallelism");

    this.options = {
      // @node-rs/argon2 defaults to Argon2id version 19.
      memoryCost: memoryCostKiB,
      timeCost,
      parallelism,
      outputLen: 32,
    };
  }

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    if (passwordHash === null) {
      // Perform equivalent native work so unknown-email login timing does not
      // become an account-enumeration signal.
      await hash(password, this.options);
      return false;
    }

    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}

function assertIntegerInRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}
