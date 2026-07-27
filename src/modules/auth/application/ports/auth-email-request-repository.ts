export type AuthEmailRequestPurpose = "email_verification" | "password_reset";

export interface AuthEmailActionToken {
  readonly value: string;
  readonly hash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface AuthEmailRequest {
  readonly id: string;
  readonly email: string;
  readonly purpose: AuthEmailRequestPurpose;
  readonly attempts: number;
  readonly claimId: string;
  readonly actionToken: AuthEmailActionToken | null;
  readonly createdAt: Date;
}

export interface EnqueueAuthEmailRequestInput {
  readonly email: string;
  readonly purpose: AuthEmailRequestPurpose;
  readonly requestedAt: Date;
  readonly cooldownBefore: Date;
  readonly replaceExisting?: boolean;
}

export interface ClaimAuthEmailRequestsInput {
  readonly at: Date;
  readonly staleBefore: Date;
  readonly limit: number;
}

export interface StoreAuthEmailActionTokenInput extends AuthEmailActionToken {
  readonly id: string;
  readonly claimId: string;
  readonly preparedAt: Date;
}

export interface AuthEmailRequestRepository {
  enqueue(input: EnqueueAuthEmailRequestInput): Promise<void>;
  claim(input: ClaimAuthEmailRequestsInput): Promise<readonly AuthEmailRequest[]>;
  /**
   * Stores the exact bearer token used to prepare a delivery. The write is
   * lease-protected and only replaces a missing or expired payload.
   */
  storeActionToken(input: StoreAuthEmailActionTokenInput): Promise<boolean>;
  complete(id: string, claimId: string, completedAt: Date): Promise<boolean>;
  retry(id: string, claimId: string, availableAt: Date): Promise<boolean>;
  deleteCompleted(before: Date): Promise<number>;
}
