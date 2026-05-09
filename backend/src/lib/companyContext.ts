import prisma from './prisma';

export interface CompanyContext {
  companyName: string;
  industry: string;
  description: string;
  vision: string;
  daysSinceCreated: number;
  agents: Array<{ id: string; name: string; role: string; department: string }>;
  tasks: Array<{ title: string; description: string; status: string; assignedAgentName?: string; hasOutput: boolean }>;
  meetings: Array<{ title: string; agenda: string[]; summary?: unknown }>;
}

export async function getCompanyContext(companyId: string): Promise<CompanyContext> {
  const [company, tasks, meetings] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      include: { agents: { select: { id: true, name: true, role: true, department: true }, orderBy: { createdAt: 'asc' } } },
    }),
    prisma.task.findMany({
      where: { companyId },
      include: { assignedAgent: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),
    prisma.meeting.findMany({
      where: { companyId },
      orderBy: { scheduledAt: 'desc' },
      take: 5,
      select: { title: true, agenda: true, summary: true },
    }),
  ]);

  if (!company) throw new Error('Company not found');

  const daysSinceCreated = Math.floor(
    (Date.now() - company.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    companyName: company.name,
    industry: company.industry,
    description: company.description,
    vision: company.vision,
    daysSinceCreated,
    agents: company.agents,
    tasks: tasks.map(t => ({
      title: t.title,
      description: t.description,
      status: t.status,
      assignedAgentName: t.assignedAgent?.name,
      hasOutput: !!t.aiOutput,
    })),
    meetings: meetings.map(m => ({
      title: m.title,
      agenda: m.agenda,
      summary: m.summary,
    })),
  };
}

export function buildContextBlock(ctx: CompanyContext): string {
  const agentList = ctx.agents.map(a => `  • ${a.name} (${a.role}, ${a.department})`).join('\n');
  const taskList = ctx.tasks.slice(0, 15).map(t =>
    `  • [${t.status}] ${t.title}${t.assignedAgentName ? ` → ${t.assignedAgentName}` : ''}${t.hasOutput ? ' ✓' : ''}`
  ).join('\n');
  const meetingList = ctx.meetings.map(m =>
    `  • ${m.title}: ${m.agenda.slice(0, 3).join(', ')}`
  ).join('\n');

  return `
━━━ COMPANY CONTEXT ━━━
Company: ${ctx.companyName}
Industry: ${ctx.industry}
Description: ${ctx.description}
Vision: ${ctx.vision}
Days operating: ${ctx.daysSinceCreated}

Team (${ctx.agents.length} members):
${agentList || '  (none yet)'}

Active work (${ctx.tasks.length} tasks):
${taskList || '  (no tasks yet)'}

Recent meetings:
${meetingList || '  (none yet)'}
━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}
