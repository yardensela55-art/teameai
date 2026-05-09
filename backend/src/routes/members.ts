import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Lazily initialized so dotenv.config() in index.ts has already run before first use
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    console.log('[Resend] Initializing with key:', key ? `${key.slice(0, 12)}…` : 'MISSING');
    _resend = new Resend(key);
  }
  return _resend;
}

async function getCompanyForUser(userId: string) {
  return prisma.company.findUnique({
    where: { ownerId: userId },
    include: { owner: { select: { name: true, email: true } } },
  });
}

const inviteSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['PARTNER', 'EMPLOYEE']),
  photoUrl: z.string().optional().or(z.literal('')),
});

function buildInviteEmail(params: {
  ownerName: string;
  companyName: string;
  inviteeName: string;
  inviteeEmail: string;
  role: 'PARTNER' | 'EMPLOYEE';
  token: string;
  frontendUrl: string;
}): { subject: string; html: string } {
  const joinUrl = `${params.frontendUrl}/join?token=${params.token}`;
  const roleLabel = params.role === 'PARTNER' ? 'Partner' : 'Employee';
  const roleColor = params.role === 'PARTNER' ? '#d97706' : '#2563eb';
  const rolePerms = params.role === 'PARTNER'
    ? 'Assign tasks, schedule meetings, chat with all AI agents, and access the full dashboard.'
    : 'Work on assigned tasks, chat with AI agents, and attend meetings.';

  return {
    subject: `[TEST] Invite for ${params.inviteeName} (${params.inviteeEmail}) — ${params.companyName} on Teame`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Test mode banner -->
        <tr>
          <td style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:12px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:600;color:#92400e;">
              🧪 TEST MODE — This invite is for <strong>${params.inviteeName}</strong> &lt;${params.inviteeEmail}&gt; (sent to owner for review)
            </p>
          </td>
        </tr>
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#89dba8,#a8d97a);padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Teame</p>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Your AI-powered company OS</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hi ${params.inviteeName}! 👋</p>
            <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
              <strong>${params.ownerName}</strong> has invited you to join <strong>${params.companyName}</strong> on Teame as a
              <span style="background:${roleColor}15;color:${roleColor};font-weight:600;padding:2px 8px;border-radius:9999px;font-size:14px;">${roleLabel}</span>
            </p>

            <!-- What is Teame -->
            <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#111827;">What is Teame?</p>
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                Teame is an AI-powered company OS with a full team of AI agents that work for you — handling tasks, attending meetings, and keeping the company running.
              </p>
            </div>

            <!-- Your access -->
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:32px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#111827;">As a ${roleLabel}, you can:</p>
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">${rolePerms}</p>
            </div>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${joinUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#89dba8,#a8d97a);color:#ffffff;font-size:16px;font-weight:700;padding:14px 40px;border-radius:9999px;text-decoration:none;letter-spacing:0.2px;">
                Join ${params.companyName} →
              </a>
            </div>

            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Teame · AI-Powered Company OS</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// List members
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const members = await prisma.companyMember.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ members });
});

// Get invite info by token (public — no auth)
router.get('/invite-info', async (req, res: Response): Promise<void> => {
  const token = String(req.query.token ?? '');
  if (!token) { res.status(400).json({ error: 'Token required' }); return; }

  const member = await prisma.companyMember.findUnique({
    where: { inviteToken: token },
    include: { company: { select: { name: true, industry: true } } },
  });

  if (!member) { res.status(404).json({ error: 'Invalid or expired invite token' }); return; }
  if (member.status === 'ACTIVE') { res.status(409).json({ error: 'This invite has already been accepted' }); return; }

  res.json({
    name: member.name,
    email: member.email,
    role: member.role,
    companyName: member.company.name,
    companyId: member.companyId,
    memberId: member.id,
  });
});

// Invite a member
router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const { name, email, role, photoUrl } = parsed.data;

  const existing = await prisma.companyMember.findFirst({
    where: { companyId: company.id, email },
  });

  if (existing) {
    if (existing.status === 'ACTIVE') {
      res.status(409).json({ error: 'This person is already in your team' });
      return;
    }

    // Status is INVITED — resend the email using the existing token
    try {
      const { subject, html } = buildInviteEmail({
        ownerName: company.owner.name,
        companyName: company.name,
        inviteeName: existing.name,
        inviteeEmail: existing.email,
        role: existing.role,
        token: existing.inviteToken!,
        frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      });
      const ownerEmail = company.owner.email;
      console.log('[Resend] Resending invite (for', existing.email, ') to owner:', ownerEmail);
      const result = await getResend().emails.send({
        from: process.env.INVITE_FROM_EMAIL ?? 'Teame <onboarding@resend.dev>',
        to: ownerEmail,
        subject,
        html,
      });
      console.log('[Resend] Resend result:', JSON.stringify(result));
    } catch (err) {
      console.error('[Resend] Failed to resend invite email:', err);
    }

    res.json({ member: existing, resent: true });
    return;
  }

  const inviteToken = uuidv4();

  const member = await prisma.companyMember.create({
    data: {
      companyId: company.id,
      name,
      email,
      role,
      status: 'INVITED',
      photoUrl: photoUrl || null,
      inviteToken,
    },
  });

  // Send invite email to owner (testing mode — Resend free tier only allows verified addresses)
  try {
    const { subject, html } = buildInviteEmail({
      ownerName: company.owner.name,
      companyName: company.name,
      inviteeName: name,
      inviteeEmail: email,
      role,
      token: inviteToken,
      frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    });
    const ownerEmail = company.owner.email;
    console.log('[Resend] Sending invite (for', email, ') to owner:', ownerEmail, '| subject:', subject);
    const result = await getResend().emails.send({
      from: process.env.INVITE_FROM_EMAIL ?? 'Teame <onboarding@resend.dev>',
      to: ownerEmail,
      subject,
      html,
    });
    console.log('[Resend] Send result:', JSON.stringify(result));
  } catch (err) {
    console.error('[Resend] Failed to send invite email:', err);
  }

  res.status(201).json({ member });
});

// Accept invite — register + link to company
router.post('/accept-invite', async (req, res: Response): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) { res.status(400).json({ error: 'token and password required' }); return; }

  const member = await prisma.companyMember.findUnique({
    where: { inviteToken: token },
  });
  if (!member) { res.status(404).json({ error: 'Invalid or expired invite token' }); return; }
  if (member.status === 'ACTIVE') { res.status(409).json({ error: 'Invite already accepted' }); return; }

  // Check if user with this email already exists
  let user = await prisma.user.findUnique({ where: { email: member.email } });
  if (!user) {
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(password, 12);
    user = await prisma.user.create({
      data: { email: member.email, name: member.name, password: hashed },
    });
  } else {
    // Validate password for existing user
    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }
  }

  // Mark member as active
  await prisma.companyMember.update({
    where: { id: member.id },
    data: { status: 'ACTIVE', inviteToken: null },
  });

  const jwt = await import('jsonwebtoken');
  const jwtToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  res.json({
    token: jwtToken,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// Get a single member
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const member = await prisma.companyMember.findFirst({ where: { id, companyId: company.id } });
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

  res.json({ member });
});

// Delete a member
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const member = await prisma.companyMember.findFirst({ where: { id, companyId: company.id } });
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

  await prisma.companyMember.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
