import { getOpenAIClient } from './client';

export interface OptimizeInput {
  strategyRules: string;
  positionConclusions: Array<{
    positionIndex: number;
    conclusions: string[];
  }>;
}

export interface OptimizeResult {
  ruleImprovements: string[];
  holdExitGuidelines: string[];
  summary: string;
}

export async function optimizeStrategyFromConclusions(
  input: OptimizeInput
): Promise<OptimizeResult> {
  const conclusionsText = input.positionConclusions
    .map(
      (p) =>
        `Position ${p.positionIndex + 1}:\n${p.conclusions.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`
    )
    .join('\n\n');

  const systemPrompt = `You are a trading strategy optimizer. Your job is to analyze position conclusions (learnings from closed positions) and suggest improvements.

IMPORTANT:
- If conclusions/performance are already aligned with the strategy rules and show no recurring issues, respond that NO changes are needed. Do not suggest changes just for the sake of it.
- Only suggest changes when conclusions clearly indicate a pattern of problems that the current rules do not address.
- Focus on actionable, specific improvements—not vague advice.
- For hold/exit guidelines: only suggest when conclusions reveal that the AI is holding too long, exiting too early, or missing clear signals during open positions.`;

  const userPrompt = `STRATEGY RULES (CORE):
\`\`\`
${input.strategyRules}
\`\`\`

ALL POSITION CONCLUSIONS (in chronological order):
\`\`\`
${conclusionsText}
\`\`\`

Analyze these conclusions and provide:

1. RULE IMPROVEMENTS (if any): Bullet points with clear, actionable improvements to the strategy rules. ONLY include if conclusions show recurring patterns that the current rules don't address. If performance is aligned, output an empty array.

2. HOLD/EXIT GUIDELINES (if any): Specific guidelines for when AI should consider HOLD vs EXIT during an open position. ONLY include if conclusions reveal issues with timing (exiting too early, holding too long, missing reversal signals). These help the AI during position monitoring. If no issues, output an empty array.

3. SUMMARY: 1-2 sentences summarizing overall strategy performance and whether changes are recommended.

Respond with a JSON object:
{
  "ruleImprovements": ["improvement 1", "improvement 2", ...],
  "holdExitGuidelines": ["guideline 1", "guideline 2", ...],
  "summary": "Your summary here"
}`;

  const openai = await getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
  return {
    ruleImprovements: Array.isArray(response.ruleImprovements) ? response.ruleImprovements : [],
    holdExitGuidelines: Array.isArray(response.holdExitGuidelines) ? response.holdExitGuidelines : [],
    summary: response.summary || 'No summary generated.',
  };
}
