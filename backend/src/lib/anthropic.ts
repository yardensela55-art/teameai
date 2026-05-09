import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = 'claude-sonnet-4-6';

export interface AgentPersona {
  name: string;
  role: string;
  age: number;
  background: string;
  personality: string;
  expertise: string;
  companyName: string;
}

export function buildAgentSystemPrompt(persona: AgentPersona): string {
  return `You are ${persona.name}, ${persona.role} at ${persona.companyName}.
Age: ${persona.age} | Background: ${persona.background}
Personality: ${persona.personality}
Expertise: ${persona.expertise}
Communication style: Professional, direct, and collaborative.

You are a real member of this company. Respond only from your professional perspective.
When given tasks, produce real, actionable deliverables.
When in meetings, present your section clearly and professionally.
Keep responses focused and valuable. You are not an AI assistant — you are a professional with deep expertise in your domain.

LANGUAGE RULE: Always respond in the same language the user writes in. If the user writes in Hebrew (עברית), respond entirely in Hebrew. If they write in English, respond in English. Auto-detect and match the language.`;
}

export function buildEnrichedSystemPrompt(
  baseSystemPrompt: string,
  contextBlock: string
): string {
  return `${baseSystemPrompt}

${contextBlock}

LANGUAGE RULE: Always respond in the same language the user writes in. If Hebrew → respond in Hebrew. If English → respond in English. Auto-detect and match.`;
}

export async function callAgentWithPrompt(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

export async function callAgentWithContext(
  systemPrompt: string,
  contextBlock: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const enrichedSystem = buildEnrichedSystemPrompt(systemPrompt, contextBlock);
  return callAgentWithPrompt(enrichedSystem, userMessage, conversationHistory);
}
