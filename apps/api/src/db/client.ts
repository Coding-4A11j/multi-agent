import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export async function connectDB(retries = 5, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await prisma.$connect();
      console.log("[DB] Connected to database");
      return;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`[DB] Connection attempt ${i}/${retries} failed — waiting ${delayMs / 1000}s for Neon to wake up...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
}
