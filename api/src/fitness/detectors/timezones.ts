import type { PrismaService } from '../../lib/prisma.js';

/** Each user's IANA timezone (UTC when they have no settings row yet). */
export async function timezonesFor(prisma: PrismaService, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const settings = await prisma.userSettings.findMany({ where: { userId: { in: userIds } }, select: { userId: true, timezone: true } });
  const byUser = new Map(settings.map((row) => [row.userId, row.timezone]));
  return new Map(userIds.map((id) => [id, byUser.get(id) ?? 'UTC']));
}
