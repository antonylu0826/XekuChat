import { prisma } from "./prisma";

export async function autoJoinOrgs(userId: string) {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  if (orgs.length === 0) return;

  // Add to all orgs at once
  await prisma.orgMember.createMany({
    data: orgs.map((org) => ({ userId, orgId: org.id, role: "member" })),
    skipDuplicates: true,
  });

  // Collect all public non-DM channels across all orgs
  const channels = await prisma.channel.findMany({
    where: {
      orgId: { in: orgs.map((o) => o.id) },
      isPrivate: false,
      type: { not: "dm" },
    },
    select: { id: true },
  });
  if (channels.length === 0) return;

  // Add to all channels at once
  await prisma.channelMember.createMany({
    data: channels.map((ch) => ({ userId, channelId: ch.id, role: "member" })),
    skipDuplicates: true,
  });
}
