import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Lab Admin";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  await prisma.rateLimitConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      globalRpmLimit: Number(process.env.RATE_LIMIT_GLOBAL_RPM ?? 8),
      globalTpmLimit: Number(process.env.RATE_LIMIT_GLOBAL_TPM ?? 200000),
      globalRpdLimit: Number(process.env.RATE_LIMIT_GLOBAL_RPD ?? 200),
      userDailyReqLimit: Number(
        process.env.RATE_LIMIT_USER_DAILY_REQUESTS ?? 30
      ),
      userDailyTokenLimit: Number(
        process.env.RATE_LIMIT_USER_DAILY_TOKENS ?? 20000
      ),
    },
  });

  console.log(`Seeded admin user: ${adminEmail}`);
  console.log("Seeded RateLimitConfig (id=1)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
