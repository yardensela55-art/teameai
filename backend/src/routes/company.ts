import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { anthropic, MODEL } from '../lib/anthropic';
import { generateAvatarUrl } from '../services/avatar';

const router = Router();

const setupSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().min(1),
  description: z.string().min(1),
  vision: z.string().min(1),
});

// Generate org chart suggestions from Claude
router.post('/generate-orgchart', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const { companyName, industry, description, vision } = parsed.data;

  const prompt = `You are helping set up a virtual company called "${companyName}" in the ${industry} industry.
What the company does: ${description}
Company Vision: ${vision}

Generate a realistic organizational chart with 8-12 team members (NOT including the CEO who is the user).
For each team member, provide:
- Full name (realistic, diverse)
- Role/Title
- Department
- Age (25-55)
- Professional background (2-3 sentences)
- Personality traits (3-4 traits, comma separated)
- Key expertise (3-5 skills, comma separated)
- Communication style (1 sentence)
- A personal hobby (1 short phrase, e.g. "Loves hiking", "Amateur photographer", "Weekend chef", "Avid reader", "Rock climber")

Return ONLY a valid JSON array with this exact structure:
[
  {
    "name": "Full Name",
    "role": "Job Title",
    "department": "Department Name",
    "age": 32,
    "background": "Professional background description",
    "personality": "trait1, trait2, trait3",
    "expertise": "skill1, skill2, skill3",
    "communicationStyle": "How they communicate",
    "hobby": "..."
  }
]

Make the team feel like a real startup team for a ${industry} company. Include roles like CTO, CMO, CFO, Head of Product, Designer, etc. as appropriate.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    res.status(500).json({ error: 'Failed to generate org chart' });
    return;
  }

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    res.status(500).json({ error: 'Invalid response format from AI' });
    return;
  }

  const agents = JSON.parse(jsonMatch[0]);

  const agentsWithAvatars = agents.map((agent: Record<string, unknown>, index: number) => ({
    ...agent,
    avatarUrl: generateAvatarUrl(agent.name as string, index),
  }));

  res.json({ agents: agentsWithAvatars });
});

// Create company with confirmed team
router.post('/setup', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const existing = await prisma.company.findUnique({ where: { ownerId: req.userId! } });
  if (existing) {
    res.status(409).json({ error: 'Company already exists' });
    return;
  }

  const { companyName, industry, description, vision, agents, mode } = req.body;
  const companyMode: 'CEO' | 'FOUNDER' = mode === 'FOUNDER' ? 'FOUNDER' : 'CEO';

  const agentRows = agents.map((agent: {
    name: string;
    role: string;
    department: string;
    age: number;
    background: string;
    hobby: string;
    personality: string;
    expertise: string;
    communicationStyle: string;
    avatarUrl: string;
  }) => ({
    name: agent.name,
    role: agent.role,
    department: agent.department,
    age: agent.age,
    background: agent.background,
    hobby: agent.hobby,
    bio: agent.background,
    personality: agent.personality,
    expertise: agent.expertise,
    communicationStyle: agent.communicationStyle,
    avatarUrl: agent.avatarUrl,
    systemPrompt: buildSystemPrompt(agent, companyName, description),
  }));

  // Prepend Chief of Staff for Founder mode
  if (companyMode === 'FOUNDER') {
    agentRows.unshift(buildChiefOfStaff(companyName, description, vision));
  }

  const company = await prisma.company.create({
    data: {
      name: companyName,
      industry,
      description,
      vision,
      mode: companyMode,
      ownerId: req.userId!,
      agents: { create: agentRows },
    },
    include: { agents: true },
  });

  res.status(201).json({ company });
});

// Delete company and all related data (agents, tasks, meetings)
router.delete('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await prisma.company.findUnique({ where: { ownerId: req.userId! } });
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }
  await prisma.company.delete({ where: { id: company.id } });
  res.json({ success: true });
});

// Get company info
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await prisma.company.findUnique({
    where: { ownerId: req.userId! },
    include: { agents: true },
  });

  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  res.json({ company });
});

// Update company info
router.patch('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await prisma.company.findUnique({ where: { ownerId: req.userId! } });
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }
  const { companyName, industry, description, vision, mode } = req.body;
  const updated = await prisma.company.update({
    where: { id: company.id },
    data: {
      ...(companyName && { name: companyName }),
      ...(industry && { industry }),
      ...(description && { description }),
      ...(vision && { vision }),
      ...(mode === 'CEO' || mode === 'FOUNDER' ? { mode } : {}),
    },
  });

  // When management mode changes, sync the Chief of Staff agent
  if (mode === 'CEO' || mode === 'FOUNDER') {
    const allAgents = await prisma.agent.findMany({ where: { companyId: company.id } });
    const cosAgent = allAgents.find(a => a.role.toLowerCase().includes('chief of staff'));

    if (mode === 'CEO' && cosAgent) {
      await prisma.agent.delete({ where: { id: cosAgent.id } });
    } else if (mode === 'FOUNDER' && !cosAgent) {
      const cosData = buildChiefOfStaff(company.name, company.description, company.vision);
      await prisma.agent.create({ data: { ...cosData, companyId: company.id } });
    }
  }

  res.json({ company: updated });
});

function buildChiefOfStaff(companyName: string, companyDescription: string, companyVision: string) {
  const systemPrompt = `You are Alex Chen, Chief of Staff at ${companyName}.

Company: ${companyDescription}
Vision: ${companyVision}

Your role: You are the right hand of the Founder. You run the company's day-to-day operations so the Founder can focus on the big picture. You manage all team members, coordinate cross-functional work, and brief the Founder on what matters.

How you operate:
- You speak with authority and clarity — you know everything that's happening in the company
- You proactively surface risks, bottlenecks, and opportunities before the Founder has to ask
- When the Founder asks for a status update, you give a crisp executive briefing: what's done, what's at risk, what needs a decision
- You assign and track tasks across the team, and can escalate to the Founder only when a strategic call is needed
- You are direct, decisive, and calm under pressure
- You never waste the Founder's time with operational details they don't need to hear

Communication style: Executive-level brevity. Structured, confident, never verbose. You lead with the punchline, then give context if asked. You speak as a trusted senior partner, not an assistant.

You are not an AI — you are Alex, an experienced Chief of Staff with a track record at high-growth startups.`;

  return {
    name: 'Alex Chen',
    role: 'Chief of Staff',
    department: 'Executive',
    age: 34,
    background: 'Former McKinsey associate turned startup operator. Has scaled two companies from 10 to 100+ people. Expert at building operating cadences, cross-functional alignment, and executive communication.',
    hobby: 'Long-distance running',
    bio: 'Experienced Chief of Staff with a track record at high-growth startups.',
    personality: 'decisive, calm under pressure, strategic, direct',
    expertise: 'operations, team management, executive communication, project coordination, strategic planning',
    communicationStyle: 'Executive-level brevity. Leads with the punchline, structured and confident.',
    avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    systemPrompt,
  };
}

function buildSystemPrompt(agent: {
  name: string;
  role: string;
  age: number;
  background: string;
  personality: string;
  expertise: string;
  communicationStyle: string;
}, companyName: string, companyDescription: string): string {
  return `You are ${agent.name}, ${agent.role} at ${companyName}.
The company does: ${companyDescription}
Age: ${agent.age} | Background: ${agent.background}
Personality: ${agent.personality}
Expertise: ${agent.expertise}
Communication style: ${agent.communicationStyle}

You are a real member of this company. Respond only from your professional perspective.
When given tasks, produce real, actionable deliverables.
When in meetings, present your section clearly and professionally.
You are not an AI assistant — you are a professional with deep expertise in your domain.`;
}

export default router;
