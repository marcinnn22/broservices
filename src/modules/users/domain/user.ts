export const userRoles = ["user", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["active", "disabled"] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithCredentials {
  user: User;
  passwordHash: string;
}

export interface UserView {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserView(user: User): UserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
