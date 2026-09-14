import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma, createAuditLog, getClientIp } from '../lib/audit.js';
import { signToken, authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

const RESET_TOKEN_HOURS = 1;
// Realistic email regex: user@domain.tld where tld is >= 2 chars, no consecutive dots
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Accepts clean 10-digit Indian mobile or +91 format: +919876543210, 9876543210
const PHONE_PATTERN = /^(?:\+91[\s-]?)?[6-9]\d{9}$/;

// ─── Public Registration (USER role ONLY) ──────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name || !phone) {
      return res.status(400).json({ error: 'Email, password, name, and phone are required' });
    }

    if (!EMAIL_PATTERN.test(String(email).trim())) {
      return res.status(400).json({ error: 'Invalid email format. Use an address such as you@example.com.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Public registration is ALWAYS USER role — no exceptions
    const userRole = 'USER';

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        phone: String(phone).trim(),
        role: userRole,
      },
      select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
    });

    await createAuditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      resource: 'user',
      metadata: { email: user.email, role: user.role },
      ipAddress: getClientIp(req),
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── Login (all roles) ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { assignedZone: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await createAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        metadata: { email: user.email },
        ipAddress: getClientIp(req),
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      resource: 'auth',
      ipAddress: getClientIp(req),
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        assignedZoneId: user.assignedZoneId,
        assignedZoneName: user.assignedZone?.name || null,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Admin: Create User (SOFTWARE_ADMIN creates MUNICIPAL_ADMIN, MUNICIPAL_ADMIN creates DRIVER) ─
router.post('/admin/create-user', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const { email, password, name, phone, role, assignedZoneId } = req.body;
    const creator = req.user;

    if (!email || !password || !name || !phone || !role) {
      return res.status(400).json({ error: 'Name, email, phone number, and password are all required.' });
    }

    const trimmedName = String(name).trim();
    if (trimmedName.length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email address format (e.g. name@domain.com).' });
    }

    const trimmedPhone = String(phone).trim();
    if (!PHONE_PATTERN.test(trimmedPhone)) {
      return res.status(400).json({ error: 'Invalid phone number. Enter a valid 10-digit mobile number (e.g. 9876543210 or +91 9876543210).' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Enforce role hierarchy: Software Admin creates Municipal Admins; Municipal Admin creates Drivers
    if (creator.role === 'SOFTWARE_ADMIN' && role !== 'MUNICIPAL_ADMIN') {
      return res.status(403).json({ error: 'Software Admin can only create Municipal Administrators' });
    }
    if (creator.role === 'MUNICIPAL_ADMIN' && role !== 'DRIVER') {
      return res.status(403).json({ error: 'Municipal Admin can only create Drivers / Workers' });
    }

    // Validate zone assignment for drivers
    if (role === 'DRIVER' && assignedZoneId) {
      const zone = await prisma.zone.findUnique({ where: { id: assignedZoneId } });
      if (!zone) {
        return res.status(400).json({ error: 'Invalid zone ID' });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'This email address is already registered in the system.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: trimmedEmail,
        passwordHash,
        name: trimmedName,
        phone: trimmedPhone,
        role,
        assignedZoneId: role === 'DRIVER' ? (assignedZoneId || null) : null,
        createdById: creator.id,
      },
      select: { id: true, email: true, name: true, phone: true, role: true, assignedZoneId: true, isActive: true, createdAt: true },
    });

    await createAuditLog({
      userId: creator.id,
      action: 'ADMIN_CREATED_USER',
      resource: 'user',
      metadata: { createdEmail: user.email, role: user.role, assignedZoneId: user.assignedZoneId },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── Admin: List Users ─────────────────────────────────────────────────────────
router.get('/admin/users', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const { role, zoneId } = req.query;
    const where = {};

    // Role scoping: Software Admin manages Municipal Admins, Municipal Admin manages Drivers
    if (req.user.role === 'SOFTWARE_ADMIN') {
      where.role = role || 'MUNICIPAL_ADMIN';
    } else if (req.user.role === 'MUNICIPAL_ADMIN') {
      where.role = 'DRIVER';
    } else if (role) {
      where.role = role;
    }

    if (zoneId) where.assignedZoneId = zoneId;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        isActive: true, assignedZoneId: true, createdAt: true,
        assignedZone: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ users });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── Admin: Update User ────────────────────────────────────────────────────────
router.patch('/admin/users/:id', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const { isActive, assignedZoneId, name, phone, password } = req.body;
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Municipal Admin can only update drivers
    if (req.user.role === 'MUNICIPAL_ADMIN' && targetUser.role !== 'DRIVER') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Cannot modify SOFTWARE_ADMIN
    if (targetUser.role === 'SOFTWARE_ADMIN') {
      return res.status(403).json({ error: 'Cannot modify Software Admin account' });
    }

    const data = {};
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (assignedZoneId !== undefined) data.assignedZoneId = assignedZoneId || null;
    if (name) data.name = name;
    if (phone) data.phone = phone;
    if (password) {
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      data.passwordHash = await bcrypt.hash(String(password), 12);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        isActive: true, assignedZoneId: true, createdAt: true,
        assignedZone: { select: { name: true } },
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'ADMIN_UPDATED_USER',
      resource: 'user',
      metadata: { targetId: user.id, changes: data },
      ipAddress: getClientIp(req),
    });

    res.json({ user });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── Admin: Delete (deactivate) User ───────────────────────────────────────────
router.delete('/admin/users/:id', authMiddleware, requireRole('SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN'), async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.role === 'SOFTWARE_ADMIN') {
      return res.status(403).json({ error: 'Cannot delete Software Admin account' });
    }

    if (req.user.role === 'MUNICIPAL_ADMIN' && targetUser.role !== 'DRIVER') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'ADMIN_DEACTIVATED_USER',
      resource: 'user',
      metadata: { targetId: req.params.id, email: targetUser.email },
      ipAddress: getClientIp(req),
    });

    res.json({ message: 'User deactivated' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// ─── Forgot Password ───────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);

    await prisma.passwordReset.create({
      data: { token, userId: user.id, expiresAt },
    });

    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      resource: 'auth',
      ipAddress: getClientIp(req),
    });

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

    console.log('\n📧 Password reset link (mock email):');
    console.log(`   ${resetUrl}\n`);

    res.json({
      message: 'If that email exists, a reset link has been sent',
      ...(process.env.NODE_ENV !== 'production' && { resetUrl }),
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

// ─── Reset Password ────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await createAuditLog({
      userId: resetRecord.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      resource: 'auth',
      ipAddress: getClientIp(req),
    });

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ─── Get Current User ──────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        assignedZoneId: true, createdAt: true,
        assignedZone: { select: { name: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        ...user,
        assignedZoneName: user.assignedZone?.name || null,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─── Audit Logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', authMiddleware, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        resource: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    res.json({ logs });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
