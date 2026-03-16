import { prisma } from "../lib/prisma";
import type { AuditAction } from "@xekuchat/core";

interface AuditEntry {
  orgId: string;
  action: AuditAction;
  actorId: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: entry.orgId,
        action: entry.action,
        actorId: entry.actorId,
        targetId: entry.targetId || null,
        meta: entry.meta || null,
      },
    });
  } catch (err) {
    // Audit logging should never crash the app
    console.error("Failed to write audit log:", err);
  }
}
