export function isChiefOfStaff(agent: { role: string }): boolean {
  return agent.role.toLowerCase().includes('chief of staff');
}

export const COS_GLOW = '0 0 0 3px #e9b84a, 0 0 18px rgba(233, 184, 74, 0.55)';
export const COS_GRADIENT = 'linear-gradient(to right, #89dba8, #a8d97a)';
