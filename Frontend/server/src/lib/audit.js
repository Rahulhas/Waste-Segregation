import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function createAuditLog({ userId, action, resource, metadata, ipAddress }) {
  return prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      resource: resource ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ipAddress: ipAddress ?? null,
    },
  });
}

export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}
