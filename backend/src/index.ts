import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import companyRoutes from './routes/company';
import agentRoutes from './routes/agents';
import taskRoutes from './routes/tasks';
import meetingRoutes from './routes/meetings';
import dashboardRoutes from './routes/dashboard';
import chatRoutes from './routes/chat';
import memberRoutes from './routes/members';
import integrationRoutes from './routes/integrations';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
});
app.use('/api/', limiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many AI requests',
});
app.use('/api/agents/chat', aiLimiter);
app.use('/api/agents/briefing', aiLimiter);
app.use('/api/agents/suggestions', aiLimiter);
app.use('/api/tasks/generate', aiLimiter);
app.use('/api/meetings/run', aiLimiter);
app.use('/api/chat', aiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/integrations', integrationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 TEAME backend running on port ${PORT}`);
  const resendKey = process.env.RESEND_API_KEY;
  console.log(`[Resend] Key at startup: ${resendKey ? `${resendKey.slice(0, 12)}… (${resendKey.length} chars)` : 'MISSING ⚠️'}`);
});

export default app;
