import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { callAgentWithPrompt, callAgentWithContext, anthropic, MODEL } from '../lib/anthropic';
import { getCompanyContext, buildContextBlock } from '../lib/companyContext';

const router = Router();

async function getCompanyForUser(userId: string) {
  return prisma.company.findUnique({ where: { ownerId: userId } });
}

// List all agents
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agents = await prisma.agent.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ agents });
});

// ── Task Suggestions (must be before /:id to avoid route shadowing) ───────────

router.get('/suggestions', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const ctx = await getCompanyContext(company.id);
  const contextBlock = buildContextBlock(ctx);

  if (ctx.agents.length === 0) {
    res.json({ suggestions: [] });
    return;
  }

  const prompt = `${contextBlock}

Generate 5 smart task suggestion chips for the ${ctx.companyName} team dashboard.

Rules:
- Each suggestion must be specific to ${ctx.companyName}'s actual business (${ctx.industry}: ${ctx.description})
- Max 6 words per suggestion text
- Start with a relevant emoji
- Don't suggest tasks already in progress or recently done
- Cover different departments/agents if possible
- Auto-assign each to the most relevant agent by role

Available agents:
${ctx.agents.map(a => `- ${a.name} (${a.role}) — id: ${a.id}`).join('\n')}

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "emoji": "🎨",
      "text": "Design spring collection mockups",
      "agentId": "agent-id",
      "agentName": "Agent Name",
      "agentRole": "Designer"
    }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { res.json({ suggestions: [] }); return; }
    const parsed = JSON.parse(match[0]) as { suggestions: unknown[] };
    res.json({ suggestions: parsed.suggestions ?? [] });
  } catch {
    res.json({ suggestions: [] });
  }
});

// ── Proactive suggestion (must be before /:id to avoid route shadowing) ───────

router.get('/proactive-check', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const doneTasks = await prisma.task.count({
    where: { companyId: company.id, status: 'DONE' },
  });

  if (doneTasks === 0 || doneTasks % 3 !== 0) {
    res.json({ suggestion: null, doneCount: doneTasks });
    return;
  }

  const allAgents = await prisma.agent.findMany({ where: { companyId: company.id } });
  const cos = allAgents.find(a =>
    a.role.toLowerCase().includes('chief of staff') ||
    (a.name.toLowerCase().includes('alex') && a.role.toLowerCase().includes('chief'))
  ) ?? allAgents[0];

  if (!cos) { res.json({ suggestion: null }); return; }

  const ctx = await getCompanyContext(company.id);
  const contextBlock = buildContextBlock(ctx);

  const prompt = `The team at ${ctx.companyName} has completed ${doneTasks} tasks total. ${contextBlock}

Write one short, energetic proactive suggestion from the Chief of Staff to the owner.
- Acknowledge the team's productivity
- Suggest a specific next milestone relevant to ${ctx.companyName}'s business
- End with "Want me to brief the team?" (or Hebrew equivalent if company context suggests Hebrew)
- Max 2 sentences total`;

  try {
    const reply = await callAgentWithContext(cos.systemPrompt, contextBlock, prompt);
    res.json({ suggestion: reply, doneCount: doneTasks, agentName: cos.name, agentAvatar: cos.avatarUrl });
  } catch {
    res.json({ suggestion: null });
  }
});

// Get single agent
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agent = await prisma.agent.findFirst({
    where: { id, companyId: company.id },
    include: { tasks: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });

  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  res.json({ agent });
});

// ── Agent-specific task suggestions ──────────────────────────────────────────

router.get('/:id/task-suggestions', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agentId = String(req.params.id);
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, companyId: company.id },
    include: { tasks: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const ctx = await getCompanyContext(company.id);
  const existingTitles = agent.tasks.map((t: { title: string }) => t.title).join(', ');

  const prompt = `You are generating task suggestions for ${agent.name}, ${agent.role} at ${ctx.companyName}.

Company: ${ctx.companyName} — ${ctx.industry} — ${ctx.description}

Generate 4 specific, immediately actionable tasks tailored exactly for a ${agent.role} at this company.
${existingTitles ? `Avoid duplicating these existing tasks: ${existingTitles}` : ''}

Return ONLY valid JSON:
{
  "suggestions": [
    { "emoji": "📋", "text": "Task name 5-7 words max" }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { res.json({ suggestions: [] }); return; }
    const parsed = JSON.parse(match[0]) as { suggestions: Array<{ emoji: string; text: string }> };
    const withAgent = (parsed.suggestions ?? []).map(s => ({
      ...s,
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
    }));
    res.json({ suggestions: withAgent });
  } catch {
    res.json({ suggestions: [] });
  }
});

// Chat with an agent — includes full company context
const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

router.post('/:id/chat', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agent = await prisma.agent.findFirst({ where: { id, companyId: company.id } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const { message, history } = parsed.data;

  try {
    const ctx = await getCompanyContext(company.id);
    const contextBlock = buildContextBlock(ctx);
    const reply = await callAgentWithContext(agent.systemPrompt, contextBlock, message, history);
    res.json({ reply, agentName: agent.name });
  } catch {
    // fallback without context
    const reply = await callAgentWithPrompt(agent.systemPrompt, message, history);
    res.json({ reply, agentName: agent.name });
  }
});

// Update agent
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agent = await prisma.agent.findFirst({ where: { id, companyId: company.id } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const { name, role, department, bio, personality, expertise } = req.body;

  const updated = await prisma.agent.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(role && { role }),
      ...(department && { department }),
      ...(bio && { bio }),
      ...(personality && { personality }),
      ...(expertise && { expertise }),
    },
  });

  res.json({ agent: updated });
});

// Create a new agent
router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const { name, role, department, age, background, personality, expertise, communicationStyle, hobby, avatarUrl } = req.body;
  if (!name || !role) { res.status(400).json({ error: 'name and role are required' }); return; }

  const agent = await prisma.agent.create({
    data: {
      name,
      role,
      department: department || 'General',
      age: age || 30,
      background: background || '',
      bio: background || '',
      personality: personality || '',
      expertise: expertise || '',
      communicationStyle: communicationStyle || '',
      hobby: hobby || '',
      avatarUrl: avatarUrl || 'https://randomuser.me/api/portraits/men/1.jpg',
      systemPrompt: `You are ${name}, ${role} at ${company.name}. ${company.industry} industry. Description: ${company.description}. You are a professional with deep expertise in your domain. Respond only from your professional perspective. LANGUAGE RULE: Always respond in the same language the user writes in. If Hebrew → Hebrew. If English → English.`,
      companyId: company.id,
    },
  });

  res.status(201).json({ agent });
});

// Generate standup
router.post('/:id/standup', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agent = await prisma.agent.findFirst({
    where: { id, companyId: company.id },
    include: { tasks: { orderBy: { updatedAt: 'desc' }, take: 10 } },
  });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const today = new Date().toISOString().split('T')[0];
  const existing = agent.standup as { date: string; completed: string; workingOn: string; blockers: string } | null;
  if (existing?.date === today) { res.json({ standup: existing }); return; }

  const recentTasks = agent.tasks.slice(0, 5);
  const completedYesterday = recentTasks.filter(t => t.status === 'DONE').map(t => t.title).join(', ') || 'No tasks completed recently';
  const inProgress = recentTasks.filter(t => t.status === 'IN_PROGRESS').map(t => t.title).join(', ') || 'No active tasks';

  try {
    const ctx = await getCompanyContext(company.id);
    const prompt = `Generate a brief daily standup in first person for ${agent.name} (${agent.role}) at ${ctx.companyName} (${ctx.industry} company).

Company context: ${ctx.description}

Recently completed: ${completedYesterday}
Currently in progress: ${inProgress}

Return ONLY a JSON object with no markdown:
{
  "completed": "1-2 sentences about yesterday",
  "workingOn": "1-2 sentences about today — be specific to ${ctx.companyName}'s business",
  "blockers": "Brief blockers or 'No blockers'"
}`;

    const reply = await callAgentWithPrompt(agent.systemPrompt, prompt);
    const match = reply.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {
      completed: 'Continued work on company objectives.',
      workingOn: `Focused on ${ctx.companyName}'s current priorities.`,
      blockers: 'No blockers',
    };

    const standup = { date: today, ...parsed };
    await prisma.agent.update({ where: { id }, data: { standup } });
    res.json({ standup });
  } catch {
    res.status(500).json({ error: 'Failed to generate standup' });
  }
});

// Delete an agent
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const agent = await prisma.agent.findFirst({ where: { id, companyId: company.id } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  await prisma.agent.delete({ where: { id } });
  res.json({ success: true });
});

// ── Morning Briefing ──────────────────────────────────────────────────────────
// Called by CoS on user login. Generates a briefing + optionally creates tasks.

router.post('/briefing', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const { createTasks = false } = req.body as { createTasks?: boolean };

  // Find Chief of Staff
  const allAgents = await prisma.agent.findMany({ where: { companyId: company.id } });
  const cos = allAgents.find(a =>
    a.role.toLowerCase().includes('chief of staff') ||
    a.name.toLowerCase().includes('alex') && a.role.toLowerCase().includes('chief')
  ) ?? allAgents[0];

  if (!cos) { res.status(404).json({ error: 'No agents found' }); return; }

  const ctx = await getCompanyContext(company.id);
  const contextBlock = buildContextBlock(ctx);

  const doneTasks = ctx.tasks.filter(t => t.status === 'DONE').length;
  const inProgressTasks = ctx.tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const backlogTasks = ctx.tasks.filter(t => t.status === 'BACKLOG').length;

  const briefingPrompt = `${contextBlock}

You are the Chief of Staff at ${ctx.companyName}. Generate a morning briefing for the company owner.

Company stage: ${ctx.daysSinceCreated === 0 ? 'Day 1 — just getting started' : `Day ${ctx.daysSinceCreated}`}
Tasks done: ${doneTasks} | In progress: ${inProgressTasks} | Backlog: ${backlogTasks}

Return ONLY valid JSON, no markdown:
{
  "points": [
    "Under 10 words. Specific accomplishment or momentum fact.",
    "Under 10 words. Top priority for today.",
    "Under 10 words. Second priority or risk to watch.",
    "Under 10 words. Team morale or forward-looking note."
  ]
}

Rules:
- Each point must be under 10 words
- Be specific to ${ctx.companyName}'s actual business and tasks
- Action-oriented, direct, no fluff
- Points should feel like real briefing bullets a Chief of Staff would say`;

  const briefingRaw = await callAgentWithContext(cos.systemPrompt, contextBlock, briefingPrompt);

  let briefingPoints: string[] = [];
  try {
    const match = briefingRaw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { points: string[] };
      briefingPoints = parsed.points.filter(p => typeof p === 'string').slice(0, 5);
    }
  } catch { /* ignore */ }
  if (briefingPoints.length === 0) {
    briefingPoints = briefingRaw.split('\n').filter(l => l.trim()).slice(0, 5);
  }
  const briefing = briefingPoints.join(' ');

  let createdTasks: unknown[] = [];

  if (createTasks && ctx.agents.length > 0) {
    // Ask CoS to plan today's tasks
    const taskPlanPrompt = `${contextBlock}

Based on ${ctx.companyName}'s business (${ctx.industry} — ${ctx.description}), plan 3-4 specific, real tasks for the team today.

Rules:
- Tasks must be specific to ${ctx.companyName}'s actual business (not generic)
- Assign each task to the most relevant team member by their role
- Tasks should be actionable and completable today
- Don't repeat tasks already in progress or done
- Each task title should be concise (max 8 words)

Available team members:
${ctx.agents.map(a => `- ${a.name} (${a.role}, ${a.department}) — id: ${a.id}`).join('\n')}

Return ONLY valid JSON, no markdown:
{
  "tasks": [
    {
      "title": "Short task title",
      "description": "2-3 sentence description of what needs to be done, specific to ${ctx.companyName}",
      "agentId": "agent-id-here",
      "priority": "HIGH" | "MEDIUM" | "LOW"
    }
  ]
}`;

    try {
      const taskPlan = await callAgentWithContext(cos.systemPrompt, contextBlock, taskPlanPrompt);
      const match = taskPlan.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { tasks: Array<{ title: string; description: string; agentId: string; priority: string }> };

        for (const t of parsed.tasks.slice(0, 4)) {
          const agent = ctx.agents.find(a => a.id === t.agentId);
          if (!agent) continue;

          // Check we're not duplicating existing tasks
          const isDuplicate = ctx.tasks.some(existing =>
            existing.title.toLowerCase() === t.title.toLowerCase()
          );
          if (isDuplicate) continue;

          const task = await prisma.task.create({
            data: {
              companyId: company.id,
              title: t.title,
              description: t.description,
              assignedAgentId: agent.id,
              priority: (['HIGH', 'MEDIUM', 'LOW'].includes(t.priority) ? t.priority : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
              status: 'IN_PROGRESS',
            },
            include: {
              assignedAgent: { select: { id: true, name: true, role: true, avatarUrl: true, department: true } },
            },
          });

          createdTasks.push(task);

          // Auto-generate output in background
          autoGenerateTaskOutput(task.id, company.id).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Briefing] Task planning failed:', err);
    }
  }

  res.json({ briefing, briefingPoints, createdTasks, agentName: cos.name, agentAvatar: cos.avatarUrl });
});

// (GET /suggestions and GET /proactive-check are registered near the top of this file, before /:id)

// ── Internal: auto-generate task output ──────────────────────────────────────

export async function autoGenerateTaskOutput(taskId: string, companyId: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    include: { assignedAgent: true },
  });

  if (!task?.assignedAgent || task.aiOutput) return;

  try {
    const ctx = await getCompanyContext(companyId);
    const contextBlock = buildContextBlock(ctx);

    const agentTasks = ctx.tasks
      .filter(t => t.assignedAgentName === task.assignedAgent!.name && t.title !== task.title)
      .slice(0, 3)
      .map(t => `- ${t.title} [${t.status}]`)
      .join('\n');

    const prompt = `You have been assigned the following task at ${ctx.companyName}:

**Task:** ${task.title}
**Description:** ${task.description}

Your other recent work:
${agentTasks || '(this is your first task)'}

Produce a REAL, detailed, professional deliverable for this task. Be specific to ${ctx.companyName}'s actual business (${ctx.industry}: ${ctx.description}).

Requirements:
- Use markdown formatting (headers, bullets, bold) for structure
- Be detailed and actionable (minimum 300 words for strategic tasks)
- Include specific examples, numbers, or references relevant to ${ctx.companyName}
- Sign with your name and role at the bottom

This is real work output — not a template. Make it genuinely useful.`;

    const output = await callAgentWithContext(task.assignedAgent.systemPrompt, contextBlock, prompt);

    await prisma.task.update({
      where: { id: taskId },
      data: { aiOutput: output, status: 'REVIEW' },
    });

    console.log(`[AutoGenerate] Task "${task.title}" completed by ${task.assignedAgent.name}`);
  } catch (err) {
    console.error(`[AutoGenerate] Failed for task ${taskId}:`, err);
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS' },
    }).catch(() => {});
  }
}

export default router;
