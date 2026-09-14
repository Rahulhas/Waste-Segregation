import { Router } from 'express';
import { prisma } from '../lib/audit.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// ─── List All Zones ────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const zones = await prisma.zone.findMany({
      include: {
        _count: { select: { bins: true, workers: true } },
      },
      orderBy: { name: 'asc' },
    });

    const result = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      shortName: zone.shortName,
      centerLat: zone.centerLat,
      centerLng: zone.centerLng,
      binCount: zone._count.bins,
      workerCount: zone._count.workers,
    }));

    res.json({ zones: result });
  } catch (err) {
    console.error('List zones error:', err);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

// ─── Get Zone Details ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const zone = await prisma.zone.findUnique({
      where: { id: req.params.id },
      include: {
        bins: { orderBy: { label: 'asc' } },
        workers: {
          where: { isActive: true },
          select: { id: true, name: true, email: true, phone: true, isActive: true },
        },
      },
    });

    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    res.json({ zone });
  } catch (err) {
    console.error('Get zone error:', err);
    res.status(500).json({ error: 'Failed to fetch zone' });
  }
});

// ─── Get Bins in Zone ──────────────────────────────────────────────────────────
router.get('/:id/bins', async (req, res) => {
  try {
    const bins = await prisma.smartBin.findMany({
      where: { zoneId: req.params.id },
      orderBy: { label: 'asc' },
    });

    res.json({ bins });
  } catch (err) {
    console.error('Get zone bins error:', err);
    res.status(500).json({ error: 'Failed to fetch bins' });
  }
});

// ─── Update Bin Fill Level (for IoT simulation or manual) ──────────────────────
router.patch('/:id/bins/:binId', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const { fillLevel, isActive } = req.body;
    const data = {};
    if (typeof fillLevel === 'number') data.fillLevel = Math.max(0, Math.min(100, fillLevel));
    if (typeof isActive === 'boolean') data.isActive = isActive;

    const bin = await prisma.smartBin.update({
      where: { id: req.params.binId },
      data,
    });

    res.json({ bin });
  } catch (err) {
    console.error('Update bin error:', err);
    res.status(500).json({ error: 'Failed to update bin' });
  }
});

export default router;
