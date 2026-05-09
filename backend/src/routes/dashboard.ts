import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const company = await prisma.company.findUnique({
    where: { ownerId: req.userId! },
    include: { agents: true },
  });

  if (!company) {
    res.status(404).json({ error: 'No company found' });
    return;
  }

  const [taskStats, recentTasks, recentMeetings] = await Promise.all([
    prisma.task.groupBy({
      by: ['status'],
      where: { companyId: company.id },
      _count: { status: true },
    }),
    prisma.task.findMany({
      where: { companyId: company.id },
      include: {
        assignedAgent: { select: { id: true, name: true, role: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.meeting.findMany({
      where: { companyId: company.id },
      include: {
        slots: {
          include: {
            agent: { select: { id: true, name: true, role: true, avatarUrl: true } },
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 3,
    }),
  ]);

  const taskCounts = {
    BACKLOG: 0,
    IN_PROGRESS: 0,
    REVIEW: 0,
    DONE: 0,
  } as Record<string, number>;

  for (const stat of taskStats) {
    taskCounts[stat.status] = stat._count.status;
  }

  const totalTasks = Object.values(taskCounts).reduce((a, b) => a + b, 0);
  const completionRate = totalTasks > 0 ? Math.round((taskCounts.DONE / totalTasks) * 100) : 0;

  res.json({
    company: {
      id: company.id,
      name: company.name,
      industry: company.industry,
      vision: company.vision,
      agentCount: company.agents.length,
    },
    tasks: {
      counts: taskCounts,
      total: totalTasks,
      completionRate,
      recent: recentTasks,
    },
    meetings: {
      total: recentMeetings.length,
      recent: recentMeetings,
    },
    agents: company.agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      department: a.department,
      avatarUrl: a.avatarUrl,
    })),
  });
});

export default router;
