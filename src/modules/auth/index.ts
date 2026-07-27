export type {
  AcceptedResult,
  AuthPrincipal,
  AuthSessionResult,
} from "./application/auth.types.js";
export {
  type AuthEmailRequestWorker,
  createAuthEmailRequestWorker,
} from "./application/auth-email-request-worker.js";
export {
  type AuthLifetimes,
  expiresAfter,
} from "./application/auth-lifetimes.js";
export {
  type AuthMaintenance,
  type AuthMaintenanceResult,
  createAuthMaintenance,
  type ExpiredAuthRecordRepository,
} from "./application/auth-maintenance.js";
export {
  type AuthUseCaseDependencies,
  type AuthUseCases,
  createAuthUseCases,
} from "./application/create-auth-use-cases.js";
export type {
  AccessTokenClaims,
  AccessTokenService,
  IssueAccessTokenInput,
} from "./application/ports/access-token-service.js";
export type {
  AuthActionTokenRepository,
  CommitPasswordResetInput,
  EmailVerificationResult,
  PasswordResetCommitResult,
  ReplaceAuthActionTokenInput,
} from "./application/ports/auth-action-token-repository.js";
export type {
  AuthEmailActionToken,
  AuthEmailRequest,
  AuthEmailRequestPurpose,
  AuthEmailRequestRepository,
  ClaimAuthEmailRequestsInput,
  EnqueueAuthEmailRequestInput,
  StoreAuthEmailActionTokenInput,
} from "./application/ports/auth-email-request-repository.js";
export type {
  AuthEmailSender,
  PasswordChangedEmail,
  PasswordResetEmail,
  VerificationEmail,
} from "./application/ports/auth-email-sender.js";
export type { Clock } from "./application/ports/clock.js";
export type { IdGenerator } from "./application/ports/id-generator.js";
export type {
  OpaqueToken,
  OpaqueTokenNamespace,
  OpaqueTokenService,
} from "./application/ports/opaque-token-service.js";
export type { PasswordHasher } from "./application/ports/password-hasher.js";
export type {
  CreateRefreshSessionInput,
  RefreshSessionRepository,
  RotateRefreshSessionInput,
} from "./application/ports/refresh-session-repository.js";
export { AuthenticateAccessToken } from "./application/use-cases/authenticate-access-token.js";
export { Login, type LoginInput } from "./application/use-cases/login.js";
export { Logout } from "./application/use-cases/logout.js";
export { LogoutAll } from "./application/use-cases/logout-all.js";
export {
  RefreshAuthSession,
  type RefreshAuthSessionInput,
} from "./application/use-cases/refresh-auth-session.js";
export {
  RegisterUser,
  type RegisterUserInput,
} from "./application/use-cases/register-user.js";
export { RequestPasswordReset } from "./application/use-cases/request-password-reset.js";
export { ResendVerificationEmail } from "./application/use-cases/resend-verification-email.js";
export {
  ResetPassword,
  type ResetPasswordInput,
} from "./application/use-cases/reset-password.js";
export { VerifyEmail } from "./application/use-cases/verify-email.js";
export {
  AccountDisabledError,
  AuthError,
  type AuthErrorCategory,
  type AuthErrorCode,
  EmailAlreadyRegisteredError,
  EmailAlreadyVerifiedError,
  EmailNotVerifiedError,
  InvalidAccessTokenError,
  InvalidActionTokenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshAlreadyRotatedError,
  RefreshTokenReusedError,
  WeakPasswordError,
} from "./domain/auth.errors.js";
export type {
  AuthActionPurpose,
  AuthActionToken,
} from "./domain/auth-action-token.js";
export {
  assertPasswordMeetsPolicy,
  passwordPolicy,
} from "./domain/password-policy.js";
export type {
  RefreshSession,
  RefreshSessionRevocationReason,
  SessionMetadata,
} from "./domain/refresh-session.js";
export {
  createAuthenticateMiddleware,
  requirePrincipal,
} from "./http/auth.middleware.js";
export { authOpenApi } from "./http/auth.openapi.js";
export {
  type AuthRouterOptions,
  type AuthRouterUseCases,
  createAuthRouter,
} from "./http/auth.routes.js";
export {
  NodemailerAuthEmailSender,
  type NodemailerAuthEmailSenderConfig,
} from "./infrastructure/email/nodemailer-auth-email-sender.js";
export { DrizzleAuthActionTokenRepository } from "./infrastructure/postgres/drizzle-auth-action-token-repository.js";
export { DrizzleAuthEmailRequestRepository } from "./infrastructure/postgres/drizzle-auth-email-request-repository.js";
export { DrizzleRefreshSessionRepository } from "./infrastructure/postgres/drizzle-refresh-session-repository.js";
export {
  Argon2PasswordHasher,
  type Argon2PasswordHasherOptions,
} from "./infrastructure/security/argon2-password-hasher.js";
export {
  type JoseAccessTokenConfig,
  JoseAccessTokenService,
} from "./infrastructure/security/jose-access-token-service.js";
export { NodeIdGenerator } from "./infrastructure/security/node-id-generator.js";
export { NodeOpaqueTokenService } from "./infrastructure/security/node-opaque-token-service.js";
export { SystemClock } from "./infrastructure/security/system-clock.js";
