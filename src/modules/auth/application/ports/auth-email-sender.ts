export interface VerificationEmail {
  email: string;
  name: string;
  token: string;
  expiresAt: Date;
}

export interface PasswordResetEmail {
  email: string;
  name: string;
  token: string;
  expiresAt: Date;
}

export interface PasswordChangedEmail {
  email: string;
  name: string;
  changedAt: Date;
}

/**
 * Implementations should durably enqueue or deliver before resolving.
 * They must never log the supplied token.
 */
export interface AuthEmailSender {
  sendVerificationEmail(message: VerificationEmail): Promise<void>;
  sendPasswordResetEmail(message: PasswordResetEmail): Promise<void>;
  sendPasswordChangedEmail(message: PasswordChangedEmail): Promise<void>;
}
