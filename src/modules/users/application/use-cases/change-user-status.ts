import { UserNotFoundError, UserOperationForbiddenError } from "../../domain/user.errors.js";
import type { UserStatus, UserView } from "../../domain/user.js";
import { toUserView } from "../../domain/user.js";
import type { UserActor } from "../actor.js";
import type { UserRepository } from "../ports/user-repository.js";

export interface ChangeUserStatusInput {
  userId: string;
  status: UserStatus;
}

export class ChangeUserStatus {
  constructor(private readonly users: UserRepository) {}

  async execute(actor: UserActor, input: ChangeUserStatusInput): Promise<UserView> {
    if (actor.role !== "admin") {
      throw new UserOperationForbiddenError();
    }

    const user = await this.users.changeStatus(
      actor.userId,
      input.userId,
      input.status,
      new Date(),
    );

    if (!user) {
      throw new UserNotFoundError();
    }

    return toUserView(user);
  }
}
