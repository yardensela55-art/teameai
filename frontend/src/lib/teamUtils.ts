import type { Agent, CompanyMember } from '../types';

export interface UnifiedPerson {
  id: string;
  name: string;
  displayRole: string;     // job title for agents, "Partner" / "Employee" for members
  department?: string;
  avatarUrl: string | null;
  type: 'agent' | 'human';
  memberRole?: 'PARTNER' | 'EMPLOYEE';
  email?: string;
}

export function agentToUnified(agent: Agent): UnifiedPerson {
  return {
    id: agent.id,
    name: agent.name,
    displayRole: agent.role,
    department: agent.department,
    avatarUrl: agent.avatarUrl,
    type: 'agent',
  };
}

export function memberToUnified(member: CompanyMember): UnifiedPerson {
  return {
    id: member.id,
    name: member.name,
    displayRole: member.role === 'PARTNER' ? 'Partner' : 'Employee',
    avatarUrl: member.photoUrl ?? null,
    type: 'human',
    memberRole: member.role,
    email: member.email,
  };
}

export function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}
