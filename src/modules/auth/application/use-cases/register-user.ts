import {
  DuplicateUserEmailError,
  normalizeEmail,
  normalizeUserName,
  toUserView,
  type User,
  type UserRepository,
  type UserView,
} from "../../../users/index.js";
import { EmailAlreadyRegisteredError } from "../../domain/auth.errors.js";
import { assertPasswordMeetsPolicy } from "../../domain/password-policy.js";
import type { AuthEmailRequestRepository } from "../ports/auth-email-request-repository.js";
import type { Clock } from "../ports/clock.js";
import type { PasswordHasher } from "../ports/password-hasher.js";

export interface RegisterUserInput {
  email: string;
  name: string;
  password: string;
}

export interface RegisterUserDependencies {
  users: UserRepository;
  passwords: PasswordHasher;
  emailRequests: AuthEmailRequestRepository;
  clock: Clock;
}

export class RegisterUser {
  constructor(private readonly dependencies: RegisterUserDependencies) {}

  async execute(input: RegisterUserInput): Promise<UserView> {
    const email = normalizeEmail(input.email);
    const name = normalizeUserName(input.name);
    assertPasswordMeetsPolicy(input.password);

    if (await this.dependencies.users.findByEmail(email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.dependencies.passwords.hash(input.password);

    let user: User;
    try {
      user = await this.dependencies.users.create({
        email,
        name,
        passwordHash,
      });
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        throw new EmailAlreadyRegisteredError({ cause: error });
      }

      throw error;
    }

    const now = this.dependencies.clock.now();

    try {
      await this.dependencies.emailRequests.enqueue({
        email: user.email,
        purpose: "email_verification",
        requestedAt: now,
        cooldownBefore: now,
        replaceExisting: true,
      });
    } catch (error) {
      try {
        await this.dependencies.users.deleteUnverified(user.id);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Registration failed and the unverified user could not be removed",
        );
      }

      throw error;
    }

    return toUserView(user);
  }
}
