export type { UserActor } from "./application/actor.js";
export {
  createUserUseCases,
  type UserUseCases,
} from "./application/create-user-use-cases.js";
export type {
  CreateUserRecord,
  ListUsersQuery,
  UserPage,
  UserRepository,
} from "./application/ports/user-repository.js";
export { ChangeUserRole } from "./application/use-cases/change-user-role.js";
export { ChangeUserStatus } from "./application/use-cases/change-user-status.js";
export { GetUser } from "./application/use-cases/get-user.js";
export {
  ListUsers,
  type ListUsersInput,
  type UserViewPage,
} from "./application/use-cases/list-users.js";
export {
  UpdateUserProfile,
  type UpdateUserProfileInput,
} from "./application/use-cases/update-user-profile.js";
export {
  DuplicateUserEmailError,
  InvalidEmailError,
  InvalidUserNameError,
  LastAdminProtectionError,
  UserError,
  type UserErrorCategory,
  type UserErrorCode,
  UserNotFoundError,
  UserOperationForbiddenError,
} from "./domain/user.errors.js";
export type {
  User,
  UserRole,
  UserStatus,
  UserView,
  UserWithCredentials,
} from "./domain/user.js";
export { toUserView, userRoles, userStatuses } from "./domain/user.js";
export { normalizeEmail, normalizeUserName } from "./domain/user-input.js";
export { usersOpenApi } from "./http/users.openapi.js";
export {
  createUsersRouter,
  type UsersRouterOptions,
} from "./http/users.routes.js";
export { DrizzleUserRepository } from "./infrastructure/postgres/drizzle-user-repository.js";
