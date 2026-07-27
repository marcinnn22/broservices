import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/**/infrastructure/postgres/*.schema.ts",
  out: "./drizzle",
  ...(process.env.DATABASE_URL === undefined
    ? {}
    : { dbCredentials: { url: process.env.DATABASE_URL } }),
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
