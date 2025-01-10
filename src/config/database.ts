import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["query", "error", "warn"],
  datasources: {
    db: {
      url: process.env.MYSQL_DATABASE_URL,
    },
  },
});

// Soft shutdown handler
const handleShutdown = async () => {
  await prisma.$disconnect();
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

export default prisma;
