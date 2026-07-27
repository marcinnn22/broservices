import { UserOperationForbiddenError } from "../../domain/user.errors.js";
import type { UserRole, UserStatus, UserView } from "../../domain/user.js";
import { toUserView } from "../../domain/user.js";
import type { UserActor } from "../actor.js";
import type { ListUsersQuery, UserRepository } from "../ports/user-repository.js";

export interface ListUsersInput {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface UserViewPage {
  items: UserView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const MAX_PAGE_SIZE = 100;

export class ListUsers {
  constructor(private readonly users: UserRepository) {}

  async execute(actor: UserActor, input: ListUsersInput = {}): Promise<UserViewPage> {
    if (actor.role !== "admin") {
      throw new UserOperationForbiddenError();
    }

    const query: ListUsersQuery = {
      page: normalizePositiveInteger(input.page, 1),
      pageSize: Math.min(normalizePositiveInteger(input.pageSize, 20), MAX_PAGE_SIZE),
    };

    const search = input.search?.trim();
    if (search) {
      query.search = search;
    }
    if (input.role) {
      query.role = input.role;
    }
    if (input.status) {
      query.status = input.status;
    }

    const result = await this.users.list(query);

    return {
      items: result.items.map(toUserView),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / result.pageSize),
    };
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}
