import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { anthropic, MODEL, callAgentWithPrompt } from '../lib/anthropic';

const router = Router();

async function getCompanyForUser(userId: string) {
  return prisma.company.findUnique({ where: { ownerId: userId } });
}

const groupChatSchema = z.object({
  message: z.string().min(1).max(4000),
  agentIds: z.array(z.string()).optional().default([]),
  pickRelevant: z.boolean().optional().default(false),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

// POST /api/chat/group
router.post('/group', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = groupChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { message, agentIds, pickRelevant, history } = parsed.data;

  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  type AgentRow = {
    id: string;
    name: string;
    role: string;
    avatarUrl: string;
    systemPrompt: string;
  };

  let selectedAgents: AgentRow[];

  if (pickRelevant || agentIds.length === 0) {
    // Fetch all company agents and let Claude pick relevant ones
    const allAgents = await prisma.agent.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'asc' },
    });

    if (allAgents.length === 0) {
      res.status(404).json({ error: 'No agents found for this company' });
      return;
    }

    const selectionPrompt = `Given this team message: "${message}"

Team members:
${allAgents.map(a => `- ID: ${a.id} | ${a.name} | ${a.role}`).join('\n')}

Which 2-3 team members should respond based on their role? Return ONLY a JSON array of IDs: ["id1", "id2"]`;

    let pickedAgents: AgentRow[] = [];
    try {
      const selectionResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: selectionPrompt }],
      });
      const textBlock = selectionResponse.content.find(b => b.type === 'text');
      const rawText = textBlock ? textBlock.text : '';
      // Extract JSON array from the response
      const match = rawText.match(/\[.*?\]/s);
      if (match) {
        const pickedIds = JSON.parse(match[0]) as string[];
        const pickedIdSet = new Set(pickedIds);
        pickedAgents = allAgents.filter(a => pickedIdSet.has(a.id));
      }
    } catch {
      // Fallback handled below
    }

    // Fallback if no valid agents were picked
    selectedAgents = pickedAgents.length > 0 ? pickedAgents : allAgents.slice(0, 2);
  } else {
    // Fetch only the requested agents belonging to this company
    const agents = await prisma.agent.findMany({
      where: {
        id: { in: agentIds },
        companyId: company.id,
      },
    });

    if (agents.length === 0) {
      res.status(404).json({ error: 'No matching agents found' });
      return;
    }

    selectedAgents = agents;
  }

  // Call each selected agent in parallel
  const responses = await Promise.all(
    selectedAgents.map(async agent => {
      try {
        const reply = await callAgentWithPrompt(agent.systemPrompt, message, history);
        return {
          agentId: agent.id,
          agentName: agent.name,
          agentRole: agent.role,
          agentAvatar: agent.avatarUrl,
          reply,
        };
      } catch {
        return {
          agentId: agent.id,
          agentName: agent.name,
          agentRole: agent.role,
          agentAvatar: agent.avatarUrl,
          reply: '',
        };
      }
    })
  );

  res.json({ responses });
});

export default router;
