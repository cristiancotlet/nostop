import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { optimizeStrategyFromConclusions } from '@/lib/ai/strategy-optimize';
import { formatRulesForPrompt } from '@/lib/strategy-rules';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const strategy = await prisma.strategy.findUnique({
      where: { id: params.id },
    });

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const positions = await prisma.position.findMany({
      where: {
        status: 'CLOSED',
        signal: { strategyId: params.id },
        learningInsights: { not: null },
      },
      include: { signal: true },
      orderBy: { createdAt: 'asc' },
    });

    const positionConclusions = positions
      .filter((p) => p.learningInsights)
      .map((p, idx) => {
        let conclusions: string[] = [];
        try {
          const parsed = JSON.parse(p.learningInsights!);
          conclusions = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          conclusions = [p.learningInsights!];
        }
        return { positionIndex: idx, conclusions };
      });

    if (positionConclusions.length === 0) {
      return NextResponse.json(
        { error: 'No closed positions with conclusions found for this strategy.' },
        { status: 400 }
      );
    }

    const result = await optimizeStrategyFromConclusions({
      strategyRules: formatRulesForPrompt(strategy.rules),
      positionConclusions,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Strategy optimize error:', error);
    if (error.message?.includes('OPENAI_API_KEY')) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to optimize strategy' },
      { status: 500 }
    );
  }
}
