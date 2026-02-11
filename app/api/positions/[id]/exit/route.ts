import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { analyzeClosedPosition } from '@/lib/ai/position-learning';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const position = await prisma.position.findUnique({
      where: { id: params.id },
      include: {
        signal: {
          include: {
            strategy: true,
            ohlcData: true,
          },
        },
        positionLogs: {
          include: {
            ohlcData: true,
          },
          orderBy: {
            candleTimestamp: 'asc',
          },
        },
      },
    });

    if (!position) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    if (position.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'Position already closed' },
        { status: 400 }
      );
    }

    // Analyze the closed position with AI to generate learning insights
    let learningInsights: string | null = null;
    try {
      const aiAnalysis = await analyzeClosedPosition(position);
      learningInsights = JSON.stringify(aiAnalysis.insights);
    } catch (error) {
      console.error('Error generating learning insights:', error);
      // Continue with position closure even if AI analysis fails
    }

    const updatedPosition = await prisma.position.update({
      where: { id: params.id },
      data: {
        status: 'CLOSED',
        exitConfirmedAt: new Date(),
        learningInsights,
      },
      include: {
        signal: {
          include: {
            strategy: true,
            ohlcData: true,
          },
        },
        positionLogs: {
          include: {
            ohlcData: true,
          },
          orderBy: {
            candleTimestamp: 'asc',
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedPosition,
    });
  } catch (error: any) {
    console.error('Exit position error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to exit position' },
      { status: 500 }
    );
  }
}
