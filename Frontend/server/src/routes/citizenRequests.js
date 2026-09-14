import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma, createAuditLog, getClientIp } from '../lib/audit.js';
import { authMiddleware, requireRole, verifyToken } from '../middleware/auth.js';

const router = Router();
const TYPES = ['overflow', 'missed_pickup', 'damaged_bin', 'bulk_ewaste'];
const STATUSES = ['submitted', 'verified', 'dispatched', 'pickup_done', 'admin_verified', 'resolved'];

// Smart bin proximity radius in degrees (~50 meters)
const SMART_BIN_RADIUS = 0.0005;

async function getZonesFromDb() {
  return prisma.zone.findMany({ include: { bins: true } });
}

function nearestZone(zones, latitude, longitude) {
  let nearest = { zone: zones[0], distance: Number.POSITIVE_INFINITY };
  for (const zone of zones) {
    const distance = Math.hypot(latitude - zone.centerLat, longitude - zone.centerLng);
    if (distance < nearest.distance) {
      nearest = { zone, distance };
    }
  }
  return nearest.zone;
}

function findNearestSmartBin(zone, latitude, longitude) {
  let nearest = null;
  let minDist = SMART_BIN_RADIUS;
  for (const bin of (zone.bins || [])) {
    const dist = Math.hypot(latitude - bin.lat, longitude - bin.lng);
    if (dist < minDist) {
      nearest = bin;
      minDist = dist;
    }
  }
  return nearest;
}

function serialize(request) {
  return {
    ...request,
    location: { lat: request.latitude, lng: request.longitude, address_string: request.addressString },
  };
}

// ─── Submit Complaint ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { citizenName, contactNumber, requestType, location, photoUrl } = req.body;
    const latitude = Number(location?.lat);
    const longitude = Number(location?.lng);
    const addressString = String(location?.address_string || '').trim();

    if (!citizenName || !contactNumber || !TYPES.includes(requestType) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !addressString) {
      return res.status(400).json({ error: 'Name, contact, request type, coordinates, and address are required' });
    }
    if (!photoUrl || typeof photoUrl !== 'string' || !photoUrl.trim()) {
      return res.status(400).json({ error: 'A photo of the waste issue is mandatory to file a complaint' });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const zones = await getZonesFromDb();
    let zoneName = 'Unknown';
    let isSmartBin = false;
    let nearestSmartBinId = null;

    if (zones.length > 0) {
      const zone = nearestZone(zones, latitude, longitude);
      zoneName = zone.name;
      const nearBin = findNearestSmartBin(zone, latitude, longitude);
      if (nearBin) {
        isSmartBin = true;
        nearestSmartBinId = nearBin.id;
      }
    }

    const request = await prisma.citizenRequest.create({
      data: {
        ticketId: `ECO-${new Date().getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`,
        citizenName: String(citizenName).trim(),
        contactNumber: String(contactNumber).trim(),
        requestType,
        latitude,
        longitude,
        addressString,
        zone: zoneName,
        photoUrl: photoUrl || null,
        isSmartBin,
        nearestSmartBinId,
      },
    });

    await createAuditLog({ action: 'CITIZEN_REQUEST_SUBMITTED', resource: request.ticketId, metadata: { zone: request.zone, requestType, isSmartBin }, ipAddress: getClientIp(req) });
    res.status(201).json({ request: serialize(request) });
  } catch (err) {
    console.error('Citizen request create error:', err);
    res.status(500).json({ error: 'Unable to submit request' });
  }
});

// ─── Public List (Citizen View: strictly scoped to requester) ──────────────────
router.get('/public', async (req, res) => {
  try {
    const { status, zone, contact, name, ticketIds } = req.query;
    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;
    if (zone) where.zone = zone;

    // Optional check for authorized staff token
    let authorizedStaff = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(authHeader.slice(7));
        if (['SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN', 'DRIVER'].includes(decoded.role)) {
          authorizedStaff = true;
        }
      } catch {}
    }

    if (!authorizedStaff) {
      // For citizens / public users: strictly only allow viewing their own complaints
      const orConditions = [];
      if (contact && String(contact).trim()) {
        orConditions.push({ contactNumber: String(contact).trim() });
      }
      if (name && String(name).trim()) {
        orConditions.push({ citizenName: String(name).trim() });
      }
      if (ticketIds) {
        const ids = String(ticketIds)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length > 0) {
          orConditions.push({ ticketId: { in: ids } });
        }
      }

      // If no requester identity criteria provided, NEVER leak other citizens' complaints
      if (orConditions.length === 0) {
        return res.json({ requests: [] });
      }

      where.OR = orConditions;
    } else {
      if (contact && String(contact).trim()) {
        where.contactNumber = String(contact).trim();
      }
    }

    let requests = await prisma.citizenRequest.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    // If requester specified their citizen name, strictly ensure only their complaints are returned
    if (!authorizedStaff && name && String(name).trim()) {
      const targetName = String(name).trim().toLowerCase();
      requests = requests.filter(
        (r) => r.citizenName?.trim().toLowerCase() === targetName
      );
    }

    res.json({ requests: requests.map(serialize) });
  } catch (err) {
    console.error('Citizen requests public fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch complaints list' });
  }
});

// ─── Track Ticket ──────────────────────────────────────────────────────────────
router.get('/track/:ticketId', async (req, res) => {
  const request = await prisma.citizenRequest.findUnique({ where: { ticketId: req.params.ticketId } });
  if (!request) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ request: serialize(request) });
});

// ─── Admin/Driver List ─────────────────────────────────────────────────────────
router.get('/', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN', 'DRIVER'), async (req, res) => {
  try {
    const { status, zone } = req.query;
    const where = {};
    if (STATUSES.includes(status)) where.status = status;
    if (zone) where.zone = zone;

    // Drivers only see their assigned complaints
    if (req.user.role === 'DRIVER') {
      where.assignedDriverId = req.user.id;
    }

    const requests = await prisma.citizenRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { timestamp: 'asc' }],
      take: 200,
    });
    res.json({ requests: requests.map(serialize) });
  } catch (err) {
    console.error('Citizen requests fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ─── Get Drivers for Zone ──────────────────────────────────────────────────────
router.get('/drivers-by-zone', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const { zoneId } = req.query;
    const where = { role: 'DRIVER', isActive: true };
    if (zoneId) where.assignedZoneId = zoneId;

    const drivers = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, assignedZoneId: true },
    });
    res.json({ drivers });
  } catch (err) {
    console.error('Fetch drivers error:', err);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// ─── Assign Driver ─────────────────────────────────────────────────────────────
router.patch('/:ticketId/assign', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ error: 'Driver ID is required' });

    const driver = await prisma.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.role !== 'DRIVER') {
      return res.status(400).json({ error: 'Invalid driver' });
    }

    const request = await prisma.citizenRequest.update({
      where: { ticketId: req.params.ticketId },
      data: { assignedDriverId: driverId, status: 'dispatched' },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'COMPLAINT_ASSIGNED_TO_DRIVER',
      resource: request.ticketId,
      metadata: { driverId, driverName: driver.name },
      ipAddress: getClientIp(req),
    });

    res.json({ request: serialize(request) });
  } catch (err) {
    console.error('Assign driver error:', err);
    res.status(500).json({ error: 'Failed to assign driver' });
  }
});

// ─── Driver Upload Pickup Proof ────────────────────────────────────────────────
router.patch('/:ticketId/pickup-proof', authMiddleware, requireRole('DRIVER'), async (req, res) => {
  try {
    const { driverProofPhotoUrl } = req.body;
    if (!driverProofPhotoUrl) {
      return res.status(400).json({ error: 'Proof photo is required' });
    }

    const existing = await prisma.citizenRequest.findUnique({ where: { ticketId: req.params.ticketId } });
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    if (existing.assignedDriverId !== req.user.id) {
      return res.status(403).json({ error: 'This ticket is not assigned to you' });
    }

    const request = await prisma.citizenRequest.update({
      where: { ticketId: req.params.ticketId },
      data: { driverProofPhotoUrl, status: 'pickup_done' },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'DRIVER_UPLOADED_PROOF',
      resource: request.ticketId,
      ipAddress: getClientIp(req),
    });

    res.json({ request: serialize(request) });
  } catch (err) {
    console.error('Pickup proof error:', err);
    res.status(500).json({ error: 'Failed to upload proof' });
  }
});

// ─── Admin Verify Cleanup ──────────────────────────────────────────────────────
router.patch('/:ticketId/verify-cleanup', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.citizenRequest.findUnique({ where: { ticketId: req.params.ticketId } });
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    if (existing.status !== 'pickup_done') {
      return res.status(400).json({ error: 'Ticket must be in pickup_done status to verify' });
    }

    const request = await prisma.citizenRequest.update({
      where: { ticketId: req.params.ticketId },
      data: { status: 'resolved' },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'ADMIN_VERIFIED_CLEANUP',
      resource: request.ticketId,
      ipAddress: getClientIp(req),
    });

    res.json({ request: serialize(request) });
  } catch (err) {
    console.error('Verify cleanup error:', err);
    res.status(500).json({ error: 'Failed to verify cleanup' });
  }
});

// ─── Generic Status Update (legacy, kept for backward compat) ──────────────────
router.patch('/:ticketId/status', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN', 'DRIVER'), async (req, res) => {
  try {
    const { status, driverProofPhotoUrl } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid request status' });

    const request = await prisma.citizenRequest.update({
      where: { ticketId: req.params.ticketId },
      data: { status, ...(driverProofPhotoUrl ? { driverProofPhotoUrl } : {}) },
    });

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'CITIZEN_REQUEST_STATUS_UPDATED',
      resource: request.ticketId,
      metadata: { status },
      ipAddress: getClientIp(req),
    });

    res.json({ request: serialize(request) });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Unable to update status' });
  }
});

// ─── Add Comment ───────────────────────────────────────────────────────────────
router.post('/:ticketId/comments', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const ticket = await prisma.citizenRequest.findUnique({ where: { ticketId: req.params.ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user.id,
        authorName: req.user.name || 'Unknown',
        content: content.trim(),
      },
    });

    res.status(201).json({ comment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ─── Get Comments ──────────────────────────────────────────────────────────────
router.get('/:ticketId/comments', async (req, res) => {
  try {
    const ticket = await prisma.citizenRequest.findUnique({ where: { ticketId: req.params.ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const comments = await prisma.ticketComment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

export default router;
