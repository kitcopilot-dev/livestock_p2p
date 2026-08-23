import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { getDatabaseUrl } from "./env";

// Prisma ORM 7 requires a driver adapter. PrismaPg uses node-pg for the
// connection pool; in production, connection settings (pool size, SSL) come
// from the deployment platform via the connection string.
const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
});

export const prisma = new PrismaClient({ adapter });
