import type { UserRepository } from "./ports/user-repository.js";
import { ChangeUserRole } from "./use-cases/change-user-role.js";
import { ChangeUserStatus } from "./use-cases/change-user-status.js";
import { GetUser } from "./use-cases/get-user.js";
import { ListUsers } from "./use-cases/list-users.js";
import { UpdateUserProfile } from "./use-cases/update-user-profile.js";

export function createUserUseCases(users: UserRepository) {
  return {
    get: new GetUser(users),
    list: new ListUsers(users),
    updateProfile: new UpdateUserProfile(users),
    changeRole: new ChangeUserRole(users),
    changeStatus: new ChangeUserStatus(users),
  } as const;
}

export type UserUseCases = ReturnType<typeof createUserUseCases>;
