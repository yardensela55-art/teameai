import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { callAgentWithContext } from '../lib/anthropic';
import { getCompanyContext, buildContextBlock } from '../lib/companyContext';
import { TaskStatus, Priority } from '@prisma/client';
import { syncTaskToJira } from './integrations';
import { autoGenerateTaskOutput } from './agents';

const router = Router();

async function getCompanyForUser(userId: string) {
  return prisma.company.findUnique({ where: { ownerId: userId } });
}

// List tasks
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const { status, agentId, memberId, priority } = req.query;

  const tasks = await prisma.task.findMany({
    where: {
      companyId: company.id,
      ...(status && { status: status as TaskStatus }),
      ...(agentId && { assignedAgentId: agentId as string }),
      ...(memberId && { assignedMemberId: memberId as string }),
      ...(priority && { priority: priority as Priority }),
    },
    include: {
      assignedAgent: { select: { id: true, name: true, role: true, avatarUrl: true, department: true } },
      assignedMember: { select: { id: true, name: true, role: true, photoUrl: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ tasks });
});

// Create task
const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  assignedAgentId: z.string().optional(),
  assignedMemberId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
  autoExecute: z.boolean().optional().default(true),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const { title, description, assignedAgentId, assignedMemberId, priority, autoExecute } = parsed.data;

  if (assignedAgentId) {
    const agent = await prisma.agent.findFirst({ where: { id: assignedAgentId, companyId: company.id } });
    if (!agent) { res.status(400).json({ error: 'Invalid agent' }); return; }
  }

  if (assignedMemberId) {
    const member = await prisma.companyMember.findFirst({ where: { id: assignedMemberId, companyId: company.id } });
    if (!member) { res.status(400).json({ error: 'Invalid member' }); return; }
  }

  const task = await prisma.task.create({
    data: {
      companyId: company.id,
      title,
      description,
      assignedAgentId: assignedAgentId || null,
      assignedMemberId: assignedMemberId || null,
      priority,
      // Start IN_PROGRESS if auto-executing, so frontend shows "thinking"
      status: (assignedAgentId && autoExecute) ? 'IN_PROGRESS' : 'BACKLOG',
    },
    include: {
      assignedAgent: { select: { id: true, name: true, role: true, avatarUrl: true, department: true } },
      assignedMember: { select: { id: true, name: true, role: true, photoUrl: true } },
    },
  });

  // Fire-and-forget auto generation
  if (assignedAgentId && autoExecute) {
    autoGenerateTaskOutput(task.id, company.id).catch(() => {});
  }

  // Async Jira sync
  syncTaskToJira(company.id, {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
  }).catch(() => {});

  res.status(201).json({ task });
});

// Generate AI output (manual trigger)
router.post('/:id/generate', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const task = await prisma.task.findFirst({
    where: { id, companyId: company.id },
    include: { assignedAgent: true },
  });

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  if (!task.assignedAgent) {
    res.status(400).json({ error: 'Task must have an assigned agent to generate output' });
    return;
  }

  await prisma.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } });

  try {
    const ctx = await getCompanyContext(company.id);
    const contextBlock = buildContextBlock(ctx);

    const agentPriorWork = ctx.tasks
      .filter(t => t.assignedAgentName === task.assignedAgent!.name && t.title !== task.title && t.hasOutput)
      .slice(0, 3)
      .map(t => `- ${t.title}`)
      .join('\n');

    const prompt = `You have been assigned the following task at ${ctx.companyName}:

**Task:** ${task.title}
**Description:** ${task.description}
**Priority:** ${task.priority}

${agentPriorWork ? `Your prior completed work:\n${agentPriorWork}\n\n` : ''}Produce a REAL, detailed, professional deliverable. Be specific to ${ctx.companyName}'s actual business (${ctx.industry}).

Requirements:
- Use markdown formatting (headers ##, bullets -, bold **text**) for clear structure
- Minimum 300 words for strategic tasks, appropriate length for tactical ones
- Include specific, actionable details relevant to ${ctx.companyName}
- No generic templates — make it genuinely useful for this company
- Sign off with: *— ${task.assignedAgent.name}, ${task.assignedAgent.role}*`;

    const output = await callAgentWithContext(task.assignedAgent.systemPrompt, contextBlock, prompt);

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { aiOutput: output, status: 'REVIEW' },
      include: {
        assignedAgent: { select: { id: true, name: true, role: true, avatarUrl: true, department: true } },
      },
    });

    res.json({ task: updated });
  } catch (err) {
    await prisma.task.update({ where: { id: task.id }, data: { status: 'BACKLOG' } });
    throw err;
  }
});

// Update task
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const task = await prisma.task.findFirst({ where: { id, companyId: company.id } });
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const { status, priority, title, description, assignedAgentId, assignedMemberId } = req.body;

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(status && { status }),
      ...(priority && { priority }),
      ...(title && { title }),
      ...(description && { description }),
      ...(assignedAgentId !== undefined && { assignedAgentId, assignedMemberId: null }),
      ...(assignedMemberId !== undefined && { assignedMemberId, assignedAgentId: null }),
    },
    include: {
      assignedAgent: { select: { id: true, name: true, role: true, avatarUrl: true, department: true } },
      assignedMember: { select: { id: true, name: true, role: true, photoUrl: true } },
    },
  });

  res.json({ task: updated });
});

// Delete task
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const task = await prisma.task.findFirst({ where: { id, companyId: company.id } });
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  await prisma.task.delete({ where: { id: task.id } });
  res.json({ success: true });
});

export default router;
