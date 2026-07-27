export type OpaqueTokenNamespace = "refresh" | "email_verification" | "password_reset";

export interface OpaqueToken {
  value: string;
  hash: string;
}

export interface OpaqueTokenService {
  issue(namespace: OpaqueTokenNamespace): OpaqueToken;
  hash(value: string): string;
}
