import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed, name },
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }

  try {
    const payload = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Change password
router.post('/change-password', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET!) as { userId: string };
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Invalid input' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return; }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    res.json({ success: true });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get('/google', (_req: Request, res: Response): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.redirect(`${process.env.FRONTEND_URL}/login?error=google_not_configured`);
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.GOOGLE_LOGIN_REDIRECT_URI ?? `${process.env.FRONTEND_URL?.replace('3000', '3001') ?? 'http://localhost:3001'}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, error } = req.query as Record<string, string>;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  if (error || !code) {
    res.redirect(`${frontendUrl}/login?error=google_cancelled`);
    return;
  }

  try {
    const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI ?? `${process.env.FRONTEND_URL?.replace('3000', '3001') ?? 'http://localhost:3001'}/api/auth/google/callback`;

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokens = await tokenRes.json() as { access_token: string };

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as { id: string; email: string; name: string; picture: string };

    // Find or create user
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: profile.id }, { email: profile.email }] },
    });

    if (user) {
      // Link Google ID if not already linked
      await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId ?? profile.id,
          googleAvatar: profile.picture,
        },
      });
    } else {
      // New user — create with empty password (Google-only auth)
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          password: '',
          googleId: profile.id,
          googleAvatar: profile.picture,
        },
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    const hasCompany = !!(await prisma.company.findUnique({ where: { ownerId: user.id } }));

    res.redirect(`${frontendUrl}/login?token=${token}&isNew=${!hasCompany}`);
  } catch (err) {
    console.error('[Google auth callback]', err);
    res.redirect(`${frontendUrl}/login?error=google_failed`);
  }
});

export default router;
