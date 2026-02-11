import { getOpenAIClient } from './client';

export async function suggestRuleRewrites(ruleText: string): Promise<string[]> {
  const systemPrompt = `You are a trading strategy editor. Given a single trading rule, suggest 3 alternative versions that are:
1. More concise - remove redundancy, use clear language
2. More specific - add concrete conditions where the original is vague
3. Easier for AI to interpret - unambiguous, actionable

Each suggestion should preserve the intent of the original rule but improve clarity and precision. Output exactly 3 options.`;

  const userPrompt = `Original rule:
"""
${ruleText}
"""

Respond with a JSON object: {"suggestions": ["option 1", "option 2", "option 3"]}`;

  const openai = await getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
  let suggestions = response.suggestions ?? response.options ?? response.rewrites ?? [];
  if (!Array.isArray(suggestions)) {
    suggestions = Object.values(response).filter((v): v is string => typeof v === 'string');
  }
  return suggestions.slice(0, 3).map(String).filter(Boolean);
}
