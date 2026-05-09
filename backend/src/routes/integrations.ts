import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

function verifyTokenFromQuery(req: Request): string | null {
  const token = req.query.token as string;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    return payload.userId;
  } catch {
    return null;
  }
}

const router = Router();

const JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize';
const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const JIRA_API_BASE = 'https://api.atlassian.com';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function getCompanyForUser(userId: string) {
  return prisma.company.findUnique({ where: { ownerId: userId } });
}

// ── Integration Status ────────────────────────────────────────────────────────

router.get('/status', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  res.json({
    jira: {
      connected: !!company.jiraAccessToken,
      workspaceName: company.jiraWorkspaceName ?? null,
    },
    google: {
      connected: !!company.googleAccessToken,
      email: company.googleEmail ?? null,
    },
  });
});

// ── Jira OAuth ────────────────────────────────────────────────────────────────

router.get('/jira/connect', async (req: Request, res: Response): Promise<void> => {
  console.log('[Jira Connect] Initiating OAuth flow');
  const clientId = process.env.JIRA_CLIENT_ID;
  if (!clientId) {
    console.log('[Jira Connect] JIRA_CLIENT_ID not configured');
    res.status(500).json({ error: 'Jira OAuth not configured' }); return;
  }

  const userId = verifyTokenFromQuery(req);
  if (!userId) {
    console.log('[Jira Connect] No valid token in query param');
    res.status(401).json({ error: 'No token provided' }); return;
  }
  console.log('[Jira Connect] userId:', userId);

  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: clientId,
    scope: 'read:jira-work write:jira-work offline_access',
    redirect_uri: process.env.JIRA_REDIRECT_URI!,
    state,
    response_type: 'code',
    prompt: 'consent',
  });

  res.redirect(`${JIRA_AUTH_URL}?${params}`);
});

router.get('/jira/callback', async (req: Request, res: Response): Promise<void> => {
  console.log('[Jira Callback] Received callback, error:', req.query.error, 'code present:', !!req.query.code);
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&jira=error`);
    return;
  }

  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for tokens
    const tokenRes = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: process.env.JIRA_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string };

    // Get accessible resources (cloud instances)
    const resourcesRes = await fetch(`${JIRA_API_BASE}/oauth/token/accessible-resources`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const resources = await resourcesRes.json() as Array<{ id: string; name: string }>;
    const cloud = resources[0];

    const company = await getCompanyForUser(userId);
    if (!company) throw new Error('Company not found');

    await prisma.company.update({
      where: { id: company.id },
      data: {
        jiraAccessToken: tokens.access_token,
        jiraRefreshToken: tokens.refresh_token,
        jiraCloudId: cloud?.id ?? null,
        jiraWorkspaceName: cloud?.name ?? null,
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&jira=connected`);
  } catch (err) {
    console.error('[Jira callback]', err);
    res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&jira=error`);
  }
});

router.post('/jira/disconnect', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  await prisma.company.update({
    where: { id: company.id },
    data: { jiraAccessToken: null, jiraRefreshToken: null, jiraCloudId: null, jiraWorkspaceName: null },
  });

  res.json({ success: true });
});

// Jira webhook — status change → update Task
router.post('/jira/webhook', async (req: Request, res: Response): Promise<void> => {
  const { issue, changelog } = req.body ?? {};
  if (!issue || !changelog) { res.json({ ok: true }); return; }

  const jiraIssueId = String(issue.id ?? '');
  if (!jiraIssueId) { res.json({ ok: true }); return; }

  const statusField = changelog?.items?.find((i: Record<string, string>) => i.field === 'status') as Record<string, string> | undefined;
  if (!statusField) { res.json({ ok: true }); return; }

  const statusMap: Record<string, string> = {
    'To Do': 'BACKLOG',
    'In Progress': 'IN_PROGRESS',
    'In Review': 'REVIEW',
    'Done': 'DONE',
  };
  const newStatus = statusMap[statusField['toString'] ?? ''] ?? null;
  if (!newStatus) { res.json({ ok: true }); return; }

  try {
    await prisma.task.updateMany({
      where: { jiraIssueId },
      data: { status: newStatus as 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' },
    });
  } catch (err) {
    console.error('[Jira webhook]', err);
  }

  res.json({ ok: true });
});

// ── Google Calendar OAuth ─────────────────────────────────────────────────────

router.get('/google/connect', async (req: Request, res: Response): Promise<void> => {
  console.log('[Google Cal Connect] Initiating OAuth flow');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.log('[Google Cal Connect] GOOGLE_CLIENT_ID not configured');
    res.status(500).json({ error: 'Google OAuth not configured' }); return;
  }

  const userId = verifyTokenFromQuery(req);
  if (!userId) {
    console.log('[Google Cal Connect] No valid token in query param');
    res.status(401).json({ error: 'No token provided' }); return;
  }
  console.log('[Google Cal Connect] userId:', userId);

  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  console.log('[Google Cal Callback] Received callback, error:', req.query.error, 'code present:', !!req.query.code);
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&google=error`);
    return;
  }

  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string };

    // Get user email
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as { email: string };

    const company = await getCompanyForUser(userId);
    if (!company) throw new Error('Company not found');

    await prisma.company.update({
      where: { id: company.id },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleEmail: profile.email,
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&google=connected`);
  } catch (err) {
    console.error('[Google callback]', err);
    res.redirect(`${process.env.FRONTEND_URL}/settings?tab=integrations&google=error`);
  }
});

router.post('/google/disconnect', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  await prisma.company.update({
    where: { id: company.id },
    data: { googleAccessToken: null, googleRefreshToken: null, googleEmail: null },
  });

  res.json({ success: true });
});

// ── Helpers (called from other routes) ───────────────────────────────────────

export async function syncTaskToJira(companyId: string, task: {
  id: string; title: string; description: string; status: string; priority: string;
}): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.jiraAccessToken || !company.jiraCloudId) return;

  const priorityMap: Record<string, string> = {
    LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High',
  };
  const statusMap: Record<string, string> = {
    BACKLOG: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'In Review', DONE: 'Done',
  };

  try {
    // Create issue
    const res = await fetch(`${JIRA_API_BASE}/ex/jira/${company.jiraCloudId}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${company.jiraAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          summary: task.title,
          description: {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: task.description }] }],
          },
          issuetype: { name: 'Task' },
          priority: { name: priorityMap[task.priority] ?? 'Medium' },
        },
      }),
    });

    if (!res.ok) return;
    const data = await res.json() as { id: string; key: string };

    await prisma.task.update({
      where: { id: task.id },
      data: { jiraIssueKey: data.key, jiraIssueId: data.id },
    });
  } catch (err) {
    console.error('[Jira sync] Failed to create issue:', err);
  }
}

export async function syncMeetingToGoogleCal(companyId: string, meeting: {
  id: string; title: string; scheduledAt: Date; agenda: string[];
}): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.googleAccessToken) return;

  try {
    const startTime = meeting.scheduledAt.toISOString();
    const endTime = new Date(meeting.scheduledAt.getTime() + 60 * 60 * 1000).toISOString(); // +1h

    const res = await fetch(`${GOOGLE_CAL_BASE}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${company.googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: meeting.title,
        description: `Agenda:\n${meeting.agenda.join('\n')}\n\nJoin in Teame: ${process.env.FRONTEND_URL}/video-call/${meeting.id}`,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      }),
    });

    if (!res.ok) return;
    const event = await res.json() as { id: string };

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { googleEventId: event.id },
    });
  } catch (err) {
    console.error('[Google Cal sync] Failed to create event:', err);
  }
}

export async function deleteGoogleCalEvent(companyId: string, googleEventId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.googleAccessToken) return;

  try {
    await fetch(`${GOOGLE_CAL_BASE}/calendars/primary/events/${googleEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${company.googleAccessToken}` },
    });
  } catch (err) {
    console.error('[Google Cal sync] Failed to delete event:', err);
  }
}

export default router;
