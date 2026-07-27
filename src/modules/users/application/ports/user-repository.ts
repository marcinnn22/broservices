import type { User, UserRole, UserStatus, UserWithCredentials } from "../../domain/user.js";

export interface CreateUserRecord {
  email: string;
  name: string;
  passwordHash: string;
  role?: UserRole;
}

export interface ListUsersQuery {
  page: number;
  pageSize: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface UserPage {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findCredentialsByEmail(email: string): Promise<UserWithCredentials | null>;
  create(input: CreateUserRecord): Promise<User>;
  deleteUnverified(id: string): Promise<boolean>;
  list(query: ListUsersQuery): Promise<UserPage>;
  updateName(id: string, name: string, updatedAt: Date): Promise<User | null>;
  changeRole(actorId: string, id: string, role: UserRole, updatedAt: Date): Promise<User | null>;
  changeStatus(
    actorId: string,
    id: string,
    status: UserStatus,
    updatedAt: Date,
  ): Promise<User | null>;
  bumpAuthVersion(id: string, updatedAt: Date): Promise<User | null>;
}
