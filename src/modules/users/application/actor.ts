import type { UserRole } from "../domain/user.js";

export interface UserActor {
  userId: string;
  role: UserRole;
}
