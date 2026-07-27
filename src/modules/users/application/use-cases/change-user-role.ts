import { UserNotFoundError, UserOperationForbiddenError } from "../../domain/user.errors.js";
import type { UserRole, UserView } from "../../domain/user.js";
import { toUserView } from "../../domain/user.js";
import type { UserActor } from "../actor.js";
import type { UserRepository } from "../ports/user-repository.js";

export interface ChangeUserRoleInput {
  userId: string;
  role: UserRole;
}

export class ChangeUserRole {
  constructor(private readonly users: UserRepository) {}

  async execute(actor: UserActor, input: ChangeUserRoleInput): Promise<UserView> {
    if (actor.role !== "admin") {
      throw new UserOperationForbiddenError();
    }

    const user = await this.users.changeRole(actor.userId, input.userId, input.role, new Date());

    if (!user) {
      throw new UserNotFoundError();
    }

    return toUserView(user);
  }
}
