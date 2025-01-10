import { testApp } from "../setup.e2e";
import prisma from "@/config/database";
import bcrypt from "bcrypt";

describe("Auth endpoints", () => {
  beforeEach(async () => {
    // Clean database before each test
    await prisma.$transaction([prisma.user.deleteMany()]);
  });

  describe("POST /api/auth/signup", () => {
    it("should create a new user", async () => {
      const response = await testApp.post("/api/auth/signup").send({
        email: "test@example.com",
        name: "Test User",
        password: "Password123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty("id");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);

      // Create test user with all required fields
      await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: hashedPassword,
          role: "USER",
          emailVerified: null,
          image: null,
          refreshToken: null,
        },
      });

      // Wait a bit to ensure user is created
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should login successfully", async () => {
      const response = await testApp.post("/api/auth/login").send({
        email: "test@example.com",
        password: "Password123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty("accessToken");
    });
  });

  describe("Email verification", () => {
    it("should verify email with valid token", async () => {
      // Create user with verification token
      const user = await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: await bcrypt.hash("Password123!", 10),
          emailVerificationToken: "test-token",
          emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const response = await testApp
        .get("/api/auth/verify-email/test-token")
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Check user is verified
      const verifiedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(verifiedUser?.emailVerified).toBeTruthy();
    });
  });
});
