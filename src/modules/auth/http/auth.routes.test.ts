import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createRateLimiters } from "../../../platform/http/index.js";
import type { UserView } from "../../users/index.js";
import type { AuthRouterUseCases } from "./auth.routes.js";
import { createAuthRouter } from "./auth.routes.js";

const user: UserView = {
  id: "66a5f7a7-89de-420d-a72b-f22a8624bc71",
  email: "person@example.com",
  name: "Test Person",
  role: "user",
  status: "active",
  emailVerifiedAt: new Date("2026-07-26T08:00:00.000Z"),
  createdAt: new Date("2026-07-26T08:00:00.000Z"),
  updatedAt: new Date("2026-07-26T08:00:00.000Z"),
};

describe("auth route rate-limit policies", () => {
  it("co-locates counted registration and failure-only login policies with their routes", async () => {
    const register = vi.fn(async () => user);
    const login = vi.fn(async () => ({
      user,
      accessToken: "signed-access-token",
      refreshToken: "opaque-refresh-token",
      refreshTokenExpiresAt: new Date("2026-08-26T08:00:00.000Z"),
    }));
    const rateLimiters = createRateLimiters({
      windowMs: 60_000,
      apiLimit: 100,
      loginLimit: 1,
      refreshLimit: 100,
      publicAuthLimit: 1,
      monitoringLimit: 100,
      emailResendWindowMs: 60_000,
      emailResendIpLimit: 100,
      emailResendRecipientLimit: 100,
    });
    const app = express();

    app.use(express.json());
    app.use(
      createAuthRouter({
        authenticate: (_request, _response, next) => next(),
        rateLimiters,
        refreshCookie: {
          name: "refresh_token",
          path: "/auth",
          secure: false,
          sameSite: "strict",
        },
        useCases: {
          register: { execute: register },
          login: { execute: login },
        } as unknown as AuthRouterUseCases,
      }),
    );

    const registration = {
      email: "person@example.com",
      name: "Test Person",
      password: "Correct-horse-battery-staple-7!",
    };
    await request(app).post("/register").send(registration).expect(201);
    await request(app).post("/register").send(registration).expect(429);
    expect(register).toHaveBeenCalledOnce();

    const credentials = {
      email: registration.email,
      password: registration.password,
    };
    await request(app).post("/login").send(credentials).expect(200);
    await request(app).post("/login").send(credentials).expect(200);
    expect(login).toHaveBeenCalledTimes(2);
  });
});
