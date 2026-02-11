import { NextRequest, NextResponse } from 'next/server';
import { suggestRuleRewrites } from '@/lib/ai/rule-suggest';
import { z } from 'zod';

const bodySchema = z.object({
  rule: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rule } = bodySchema.parse(body);

    const suggestions = await suggestRuleRewrites(rule);

    return NextResponse.json({
      success: true,
      data: { suggestions },
    });
  } catch (error: any) {
    console.error('Suggest rule error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    if (error.message?.includes('OPENAI_API_KEY')) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to suggest rule rewrites' },
      { status: 500 }
    );
  }
}
