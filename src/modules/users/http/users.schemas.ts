import { z } from "zod";

import { userRoles, userStatuses } from "../domain/user.js";

const emptyObject = z.object({}).passthrough();
const userIdParams = z.object({ userId: z.uuid() });

export const listUsersRequestSchema = z.object({
  body: emptyObject,
  params: emptyObject,
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().min(1).max(320).optional(),
    role: z.enum(userRoles).optional(),
    status: z.enum(userStatuses).optional(),
  }),
  headers: emptyObject,
});

export const userIdRequestSchema = z.object({
  body: emptyObject,
  params: userIdParams,
  query: emptyObject,
  headers: emptyObject,
});

export const updateProfileRequestSchema = z.object({
  body: z.object({ name: z.string().trim().min(2).max(100) }),
  params: userIdParams,
  query: emptyObject,
  headers: emptyObject,
});

export const updateOwnProfileRequestSchema = z.object({
  body: z.object({ name: z.string().trim().min(2).max(100) }),
  params: emptyObject,
  query: emptyObject,
  headers: emptyObject,
});

export const changeRoleRequestSchema = z.object({
  body: z.object({ role: z.enum(userRoles) }),
  params: userIdParams,
  query: emptyObject,
  headers: emptyObject,
});

export const changeStatusRequestSchema = z.object({
  body: z.object({ status: z.enum(userStatuses) }),
  params: userIdParams,
  query: emptyObject,
  headers: emptyObject,
});

export type ListUsersRequest = z.infer<typeof listUsersRequestSchema>;
export type UserIdRequest = z.infer<typeof userIdRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileRequestSchema>;
export type ChangeRoleRequest = z.infer<typeof changeRoleRequestSchema>;
export type ChangeStatusRequest = z.infer<typeof changeStatusRequestSchema>;
