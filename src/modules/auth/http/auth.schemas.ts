import { z } from "zod";

const email = z.string().trim().email().max(320);
const password = z.string().min(1).max(1_024);
const actionToken = z.string().trim().min(16).max(512);
const emptyObject = z.object({}).passthrough();

const requestSchema = <T extends z.ZodType>(body: T) =>
  z.object({
    body,
    params: emptyObject,
    query: emptyObject,
    headers: emptyObject,
  });

export const registerRequestSchema = requestSchema(
  z.object({
    email,
    name: z.string().trim().min(2).max(100),
    password,
  }),
);

export const loginRequestSchema = requestSchema(
  z.object({
    email,
    password,
  }),
);

export const emailRequestSchema = requestSchema(z.object({ email }));

export const verifyEmailRequestSchema = requestSchema(
  z.object({
    token: actionToken,
  }),
);

export const resetPasswordRequestSchema = requestSchema(
  z.object({
    token: actionToken,
    password,
  }),
);

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type EmailRequest = z.infer<typeof emailRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
