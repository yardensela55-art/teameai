export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  department: string;
  age?: number;
  bio?: string;
  background?: string;
  personality?: string;
  expertise?: string;
  communicationStyle?: string;
  avatarUrl: string;
  companyId: string;
  createdAt?: string;
  hobby?: string;
}

export type CompanyMode = 'CEO' | 'FOUNDER';
export type CompanyMemberRole = 'PARTNER' | 'EMPLOYEE';
export type MemberStatus = 'INVITED' | 'ACTIVE';

export interface CompanyMember {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: CompanyMemberRole;
  status: MemberStatus;
  photoUrl?: string | null;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  description: string;
  vision: string;
  ownerId: string;
  mode: CompanyMode;
  agents: Agent[];
}

export type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  aiOutput?: string;
  assignedAgentId?: string;
  assignedAgent?: Pick<Agent, 'id' | 'name' | 'role' | 'avatarUrl' | 'department'>;
  assignedMemberId?: string;
  assignedMember?: Pick<CompanyMember, 'id' | 'name' | 'role' | 'photoUrl'>;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export type MeetingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
export type MeetingMode = 'CHAT' | 'PRESENTATION' | 'VIDEO';

export interface MeetingSlot {
  id: string;
  meetingId: string;
  agentId: string;
  agent: Pick<Agent, 'id' | 'name' | 'role' | 'avatarUrl' | 'department'>;
  topic: string;
  presentationOutput?: string;
  order: number;
}

export interface MeetingSummaryActionItem {
  what: string;
  who: string;
  agentId: string | null;
  agentAvatar: string | null;
  timeline: string;
}

export interface MeetingSummary {
  keyPoints: { topic: string; points: string[] }[];
  decisions: string[];
  actionItems: MeetingSummaryActionItem[];
  nextSteps: string[];
}

export interface Meeting {
  id: string;
  title: string;
  agenda: string[];
  status: MeetingStatus;
  scheduledAt: string;
  transcript?: string[];
  slots: MeetingSlot[];
  memberIds?: string[];
  companyId: string;
  createdAt: string;
  mode?: MeetingMode;
  leadAgentId?: string;
  summary?: MeetingSummary | null;
}

export interface DashboardData {
  company: {
    id: string;
    name: string;
    industry: string;
    vision: string;
    agentCount: number;
  };
  tasks: {
    counts: Record<TaskStatus, number>;
    total: number;
    completionRate: number;
    recent: Task[];
  };
  meetings: {
    total: number;
    recent: Meeting[];
  };
  agents: Pick<Agent, 'id' | 'name' | 'role' | 'department' | 'avatarUrl'>[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrgChartAgent {
  name: string;
  role: string;
  department: string;
  age: number;
  background: string;
  personality: string;
  expertise: string;
  communicationStyle: string;
  avatarUrl: string;
  hobby: string;
}
