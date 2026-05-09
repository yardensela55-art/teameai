// Seed script — run with: npm run db:seed
// Currently empty; data is created through the onboarding flow.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('No seed data needed — use the onboarding flow to create your company.');
}
main().catch(console.error).finally(() => prisma.$disconnect());
