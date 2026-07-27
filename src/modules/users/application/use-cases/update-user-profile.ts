import { UserNotFoundError, UserOperationForbiddenError } from "../../domain/user.errors.js";
import { toUserView, type UserView } from "../../domain/user.js";
import { normalizeUserName } from "../../domain/user-input.js";
import type { UserActor } from "../actor.js";
import type { UserRepository } from "../ports/user-repository.js";

export interface UpdateUserProfileInput {
  userId: string;
  name: string;
}

export class UpdateUserProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(actor: UserActor, input: UpdateUserProfileInput): Promise<UserView> {
    if (actor.role !== "admin" && actor.userId !== input.userId) {
      throw new UserOperationForbiddenError();
    }

    const user = await this.users.updateName(
      input.userId,
      normalizeUserName(input.name),
      new Date(),
    );

    if (!user) {
      throw new UserNotFoundError();
    }

    return toUserView(user);
  }
}
