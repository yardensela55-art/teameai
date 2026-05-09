import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { callAgentWithPrompt, anthropic, MODEL } from '../lib/anthropic';
import { syncMeetingToGoogleCal, deleteGoogleCalEvent } from './integrations';

const router = Router();

async function getCompanyForUser(userId: string) {
  return prisma.company.findUnique({ where: { ownerId: userId } });
}

const slotInclude = {
  slots: {
    include: {
      agent: { select: { id: true, name: true, role: true, avatarUrl: true, department: true } as const },
    },
    orderBy: { order: 'asc' as const },
  },
};

// List meetings
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const meetings = await prisma.meeting.findMany({
    where: { companyId: company.id },
    include: slotInclude,
    orderBy: { scheduledAt: 'desc' },
  });

  res.json({ meetings });
});

// Get single meeting
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, companyId: company.id },
    include: slotInclude,
  });

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  res.json({ meeting });
});

// Schedule a meeting
const scheduleSchema = z.object({
  title: z.string().min(1).max(200),
  agenda: z.array(z.string().min(1)).min(1).max(10),
  agentIds: z.array(z.string()).min(1),
  memberIds: z.array(z.string()).optional().default([]),
  scheduledAt: z.string().datetime().optional(),
  mode: z.enum(['CHAT', 'PRESENTATION', 'VIDEO']).optional().default('CHAT'),
  leadAgentId: z.string().optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const { title, agenda, agentIds, memberIds, scheduledAt, mode, leadAgentId } = parsed.data;

  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds }, companyId: company.id },
  });

  if (agents.length !== agentIds.length) {
    res.status(400).json({ error: 'One or more invalid agents' });
    return;
  }

  const meeting = await prisma.meeting.create({
    data: {
      companyId: company.id,
      title,
      agenda,
      memberIds: memberIds ?? [],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      mode,
      leadAgentId: leadAgentId ?? null,
      slots: {
        create: agentIds.map((agentId, index) => ({
          agentId,
          topic: agenda[index % agenda.length],
          order: index,
        })),
      },
    },
    include: slotInclude,
  });

  // Async Google Cal sync
  syncMeetingToGoogleCal(company.id, {
    id: meeting.id,
    title: meeting.title,
    scheduledAt: meeting.scheduledAt,
    agenda: meeting.agenda,
  }).catch(() => {});

  res.status(201).json({ meeting });
});

// Run a meeting — PRESENTATION mode uses slot-based system, CHAT mode iterates all agents per topic
router.post('/:id/run', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, companyId: company.id },
    include: {
      slots: {
        include: { agent: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status === 'COMPLETED') {
    res.status(400).json({ error: 'Meeting already completed' });
    return;
  }

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: 'IN_PROGRESS' },
  });

  console.log(`[Meeting ${id}] Running in ${meeting.mode} mode with ${meeting.slots.length} agents, ${meeting.agenda.length} topic(s)`);

  if (meeting.mode === 'PRESENTATION') {
    // --- PRESENTATION mode: existing slot-based behavior ---
    const transcript: string[] = [];

    for (const slot of meeting.slots) {
      const prompt = `You are presenting in a company meeting titled "${meeting.title}".

Meeting agenda: ${meeting.agenda.join(', ')}

Your topic: ${slot.topic}

Previous presentations in this meeting:
${transcript.length > 0 ? transcript.join('\n\n---\n\n') : 'You are the first presenter.'}

Please give your professional presentation on your topic. Be specific, data-driven where possible, and reference insights from other presenters if relevant. Keep it focused and actionable — 3-5 key points. End with one concrete recommendation or next step.`;

      console.log(`[Meeting ${id}] Calling Claude for ${slot.agent.name} (${slot.topic})`);
      const output = await callAgentWithPrompt(slot.agent.systemPrompt, prompt);
      console.log(`[Meeting ${id}] Got response from ${slot.agent.name} (${output.length} chars)`);

      await prisma.meetingSlot.update({
        where: { id: slot.id },
        data: { presentationOutput: output },
      });

      transcript.push(`**${slot.agent.name} (${slot.agent.role})** — ${slot.topic}:\n\n${output}`);
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'COMPLETED', transcript },
      include: slotInclude,
    });

    res.json({ meeting: updatedMeeting });
  } else {
    // --- CHAT mode: for each topic, each agent gives a short conversational response ---
    const transcript: string[] = [];

    for (let topicIndex = 0; topicIndex < meeting.agenda.length; topicIndex++) {
      const topic = meeting.agenda[topicIndex];
      const topicMessages: string[] = [];

      for (const slot of meeting.slots) {
        const previousInTopic = topicMessages.length > 0
          ? `\n\nWhat others have said about this topic so far:\n${topicMessages.join('\n\n')}`
          : '\n\nYou are the first to respond to this topic.';

        const prompt = `You are in a team meeting titled "${meeting.title}".

Current topic (${topicIndex + 1} of ${meeting.agenda.length}): ${topic}
${previousInTopic}

Give a short, conversational response to this topic from your professional perspective. React naturally and reference what previous colleagues said if relevant. Keep it to roughly 100-150 words — concise and direct.`;

        console.log(`[Meeting ${id}] Calling Claude for ${slot.agent.name} on topic "${topic}"`);
        const content = await callAgentWithPrompt(slot.agent.systemPrompt, prompt);
        console.log(`[Meeting ${id}] Got response from ${slot.agent.name} (${content.length} chars)`);

        const message = JSON.stringify({
          agentId: slot.agent.id,
          agentName: slot.agent.name,
          agentRole: slot.agent.role,
          agentAvatar: slot.agent.avatarUrl,
          topic,
          topicIndex,
          content,
        });

        transcript.push(message);
        topicMessages.push(`${slot.agent.name} (${slot.agent.role}): ${content}`);
      }
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: 'COMPLETED', transcript },
      include: slotInclude,
    });

    res.json({ meeting: updatedMeeting });
  }
});

// Ask a follow-up question to a specific agent after a meeting
const followUpSchema = z.object({
  agentId: z.string(),
  question: z.string().min(1).max(2000),
});

router.post('/:id/followup', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, companyId: company.id },
    include: {
      slots: {
        include: { agent: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  const { agentId, question } = parsed.data;

  const slot = meeting.slots.find(s => s.agentId === agentId);
  if (!slot) {
    res.status(400).json({ error: 'Agent was not in this meeting' });
    return;
  }

  const context = `You just finished presenting in a company meeting titled "${meeting.title}".

Your presentation was about: ${slot.topic}

What you presented:
${slot.presentationOutput}

The CEO is now asking you a follow-up question. Answer concisely and professionally based on your expertise.`;

  const reply = await callAgentWithPrompt(slot.agent.systemPrompt, question, [
    { role: 'user', content: context },
    { role: 'assistant', content: "Understood, I remember my presentation. I'm ready for your follow-up question." },
  ]);

  res.json({ reply, agentName: slot.agent.name });
});

// Delete a meeting
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id, companyId: company.id },
  });

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  // Delete Google Cal event if synced
  if (meeting.googleEventId) {
    deleteGoogleCalEvent(company.id, meeting.googleEventId).catch(() => {});
  }

  await prisma.meeting.delete({ where: { id: meeting.id } });
  res.json({ success: true });
});

// Generate and save a structured meeting summary
router.post('/:id/summarize', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) { res.status(404).json({ error: 'No company found' }); return; }

  const meeting = await prisma.meeting.findFirst({
    where: { id, companyId: company.id },
    include: {
      slots: {
        include: { agent: true },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!meeting) { res.status(404).json({ error: 'Meeting not found' }); return; }

  // Return cached summary if it exists
  if (meeting.summary) {
    res.json({ summary: meeting.summary });
    return;
  }

  // Build transcript text
  let transcriptText = '';
  if (meeting.mode === 'PRESENTATION') {
    transcriptText = meeting.slots
      .filter(s => s.presentationOutput)
      .map(s => `${s.agent.name} (${s.agent.role}) — "${s.topic}":\n${s.presentationOutput}`)
      .join('\n\n---\n\n');
  } else {
    transcriptText = meeting.transcript.map(t => {
      try {
        const p = JSON.parse(t);
        return `${p.agentName} (${p.agentRole}): ${p.content ?? p.text ?? ''}`;
      } catch { return t; }
    }).join('\n\n');
  }

  if (!transcriptText.trim()) {
    res.status(400).json({ error: 'No transcript available to summarize' });
    return;
  }

  const agentNameMap: Record<string, { id: string; avatarUrl: string }> = {};
  for (const slot of meeting.slots) {
    agentNameMap[slot.agent.name.toLowerCase()] = { id: slot.agent.id, avatarUrl: slot.agent.avatarUrl };
  }

  const attendeeList = meeting.slots.map(s => `${s.agent.name} (${s.agent.role})`).join(', ');

  const prompt = `You are generating a structured meeting summary. Return ONLY valid JSON — no markdown, no prose, no code fences.

Meeting: "${meeting.title}"
Attendees: ${attendeeList}
Agenda: ${meeting.agenda.join(', ')}

Transcript:
${transcriptText}

Return exactly this JSON structure:
{
  "keyPoints": [{"topic": "...", "points": ["...", "..."]}],
  "decisions": ["..."],
  "actionItems": [{"what": "...", "who": "Exact Agent Name", "timeline": "e.g. 1 week"}],
  "nextSteps": ["..."]
}

Rules:
- keyPoints: 2-5 topics (use agenda items), 2-4 bullets each
- decisions: concrete decisions made (empty array if none)
- actionItems: 2-6 specific tasks; "who" must be one of: ${Object.keys(agentNameMap).map(n => meeting.slots.find(s => s.agent.name.toLowerCase() === n)?.agent.name).filter(Boolean).join(', ')}
- nextSteps: 2-4 broader next steps
- Be concise and specific`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { res.status(500).json({ error: 'Failed to parse summary from AI' }); return; }

  const parsed = JSON.parse(jsonMatch[0]);

  // Enrich action items with agentId + agentAvatar by matching name
  if (Array.isArray(parsed.actionItems)) {
    parsed.actionItems = parsed.actionItems.map((item: { what: string; who: string; timeline: string }) => {
      const key = (item.who ?? '').toLowerCase();
      const match = agentNameMap[key];
      return { ...item, agentId: match?.id ?? null, agentAvatar: match?.avatarUrl ?? null };
    });
  }

  const saved = await prisma.meeting.update({
    where: { id },
    data: { summary: parsed },
    include: slotInclude,
  });

  res.json({ summary: saved.summary });
});

// End a video call meeting — marks as COMPLETED, optionally saves transcript
router.post('/:id/end', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const company = await getCompanyForUser(req.userId!);
  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }
  const meeting = await prisma.meeting.findFirst({
    where: { id, companyId: company.id },
    include: slotInclude,
  });
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }
  const { transcript } = req.body;
  const updated = await prisma.meeting.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      ...(Array.isArray(transcript) && { transcript }),
    },
    include: slotInclude,
  });
  res.json({ meeting: updated });
});

export default router;
