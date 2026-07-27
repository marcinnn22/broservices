import { UserNotFoundError, UserOperationForbiddenError } from "../../domain/user.errors.js";
import { toUserView, type UserView } from "../../domain/user.js";
import type { UserActor } from "../actor.js";
import type { UserRepository } from "../ports/user-repository.js";

export class GetUser {
  constructor(private readonly users: UserRepository) {}

  async execute(actor: UserActor, userId: string): Promise<UserView> {
    if (actor.role !== "admin" && actor.userId !== userId) {
      throw new UserOperationForbiddenError();
    }

    const user = await this.users.findById(userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    return toUserView(user);
  }
}
