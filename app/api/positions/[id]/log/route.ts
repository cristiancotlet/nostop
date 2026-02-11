import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { analyzePositionProgress } from '@/lib/ai/position-monitor';

const addLogSchema = z.object({
  ohlcDataId: z.string(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { ohlcDataId } = addLogSchema.parse(body);

    // Fetch position
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
        { error: 'Cannot add log to closed position' },
        { status: 400 }
      );
    }

    if (position.currentCandleCount >= 10) {
      return NextResponse.json(
        { error: 'Position has reached maximum candle count (10)' },
        { status: 400 }
      );
    }

    // Fetch OHLC data
    const ohlcData = await prisma.oHLCData.findUnique({
      where: { id: ohlcDataId },
    });

    if (!ohlcData) {
      return NextResponse.json(
        { error: 'OHLC data not found' },
        { status: 404 }
      );
    }

    // Call AI service to analyze position progress
    const aiResult = await analyzePositionProgress(position, ohlcData);

    // Create position log
    const positionLog = await prisma.positionLog.create({
      data: {
        positionId: params.id,
        candleTimestamp: ohlcData.timestamp,
        conclusion: aiResult.conclusion,
        ohlcDataId,
        closePrice: ohlcData.close,
      },
    });

    // Update position candle count
    const updatedPosition = await prisma.position.update({
      where: { id: params.id },
      data: {
        currentCandleCount: position.currentCandleCount + 1,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        positionLog,
        position: updatedPosition,
      },
    });
  } catch (error: any) {
    console.error('Add position log error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to add position log' },
      { status: 500 }
    );
  }
}
