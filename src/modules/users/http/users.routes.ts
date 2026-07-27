import type { RequestHandler } from "express";
import { Router } from "express";

import {
  getValidatedRequest,
  HttpError,
  response,
  sendSuccess,
  validateRequest,
} from "../../../platform/http/index.js";
import type {
  ChangeUserRole,
  ChangeUserStatus,
  GetUser,
  ListUsers,
  UpdateUserProfile,
} from "../index.js";
import {
  type ChangeRoleRequest,
  type ChangeStatusRequest,
  changeRoleRequestSchema,
  changeStatusRequestSchema,
  type ListUsersRequest,
  listUsersRequestSchema,
  type UpdateOwnProfileRequest,
  type UpdateProfileRequest,
  type UserIdRequest,
  updateOwnProfileRequestSchema,
  updateProfileRequestSchema,
  userIdRequestSchema,
} from "./users.schemas.js";

export interface UsersRouterOptions {
  readonly authenticate: RequestHandler;
  readonly useCases: {
    readonly get: GetUser;
    readonly list: ListUsers;
    readonly updateProfile: UpdateUserProfile;
    readonly changeRole: ChangeUserRole;
    readonly changeStatus: ChangeUserStatus;
  };
}

const requirePrincipal = (request: Express.Request) => {
  if (request.principal === undefined) {
    throw HttpError.unauthorized();
  }

  return request.principal;
};

export function createUsersRouter(options: UsersRouterOptions): Router {
  const router = Router();
  const { useCases } = options;

  router.use(options.authenticate);

  router.get("/me", async (request, httpResponse) => {
    const principal = requirePrincipal(request);
    const user = await useCases.get.execute(principal, principal.userId);
    response.ok(httpResponse, { user });
  });

  router.patch(
    "/me",
    validateRequest(updateOwnProfileRequestSchema),
    async (request, httpResponse) => {
      const principal = requirePrincipal(request);
      const { body } = getValidatedRequest<UpdateOwnProfileRequest>(httpResponse);
      const user = await useCases.updateProfile.execute(principal, {
        userId: principal.userId,
        name: body.name,
      });
      response.ok(httpResponse, { user });
    },
  );

  router.get("/", validateRequest(listUsersRequestSchema), async (request, httpResponse) => {
    const { query } = getValidatedRequest<ListUsersRequest>(httpResponse);
    const result = await useCases.list.execute(requirePrincipal(request), {
      ...(query.page === undefined ? {} : { page: query.page }),
      ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    sendSuccess(httpResponse, {
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  });

  router.get("/:userId", validateRequest(userIdRequestSchema), async (request, httpResponse) => {
    const { params } = getValidatedRequest<UserIdRequest>(httpResponse);
    const user = await useCases.get.execute(requirePrincipal(request), params.userId);
    response.ok(httpResponse, { user });
  });

  router.patch(
    "/:userId",
    validateRequest(updateProfileRequestSchema),
    async (request, httpResponse) => {
      const { body, params } = getValidatedRequest<UpdateProfileRequest>(httpResponse);
      const user = await useCases.updateProfile.execute(requirePrincipal(request), {
        userId: params.userId,
        name: body.name,
      });
      response.ok(httpResponse, { user });
    },
  );

  router.patch(
    "/:userId/role",
    validateRequest(changeRoleRequestSchema),
    async (request, httpResponse) => {
      const { body, params } = getValidatedRequest<ChangeRoleRequest>(httpResponse);
      const user = await useCases.changeRole.execute(requirePrincipal(request), {
        userId: params.userId,
        role: body.role,
      });
      response.ok(httpResponse, { user });
    },
  );

  router.patch(
    "/:userId/status",
    validateRequest(changeStatusRequestSchema),
    async (request, httpResponse) => {
      const { body, params } = getValidatedRequest<ChangeStatusRequest>(httpResponse);
      const user = await useCases.changeStatus.execute(requirePrincipal(request), {
        userId: params.userId,
        status: body.status,
      });
      response.ok(httpResponse, { user });
    },
  );

  return router;
}
