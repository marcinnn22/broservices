import { normalizeEmail } from "../../../users/index.js";
import { type AcceptedResult, acceptedResult } from "../auth.types.js";
import type { AuthEmailRequestRepository } from "../ports/auth-email-request-repository.js";
import type { Clock } from "../ports/clock.js";

export interface ResendVerificationEmailDependencies {
  requests: AuthEmailRequestRepository;
  clock: Clock;
  requestCooldownMs: number;
}

export class ResendVerificationEmail {
  constructor(private readonly dependencies: ResendVerificationEmailDependencies) {}

  async execute(rawEmail: string): Promise<AcceptedResult> {
    const email = normalizeEmail(rawEmail);
    const now = this.dependencies.clock.now();

    // Every syntactically valid address takes the same durable enqueue path.
    // Account eligibility and SMTP delivery happen in the background worker.
    await this.dependencies.requests.enqueue({
      email,
      purpose: "email_verification",
      requestedAt: now,
      cooldownBefore: new Date(now.getTime() - this.dependencies.requestCooldownMs),
    });

    return acceptedResult;
  }
}
