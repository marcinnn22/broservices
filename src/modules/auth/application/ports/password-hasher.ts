export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /**
   * A null hash represents an unknown account. Implementations must still do
   * comparable expensive work to reduce email-address timing disclosure.
   */
  verify(password: string, passwordHash: string | null): Promise<boolean>;
}
