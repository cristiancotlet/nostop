import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { processPositionLogsForNewCandle } from '@/lib/position-log-processor';

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

    const position = await prisma.position.findUnique({
      where: { id: params.id },
      include: {
        signal: { include: { strategy: true, ohlcData: true } },
        positionLogs: { include: { ohlcData: true }, orderBy: { candleTimestamp: 'asc' } },
      },
    });

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    if (position.status === 'CLOSED') {
      return NextResponse.json({ error: 'Cannot add log to closed position' }, { status: 400 });
    }

    if (position.currentCandleCount >= 10) {
      return NextResponse.json(
        { error: 'Position has reached maximum candle count (10)' },
        { status: 400 }
      );
    }

    const ohlcData = await prisma.oHLCData.findUnique({
      where: { id: ohlcDataId },
    });

    if (!ohlcData) {
      return NextResponse.json({ error: 'OHLC data not found' }, { status: 404 });
    }

    // Use shared processor with recommendation mode (HOLD/EXIT)
    await processPositionLogsForNewCandle(
      ohlcDataId,
      position.signal.instrument,
      position.signal.timeframe,
      params.id
    );

    const updatedPosition = await prisma.position.findUnique({
      where: { id: params.id },
      include: {
        signal: { include: { strategy: true, ohlcData: true } },
        positionLogs: { include: { ohlcData: true }, orderBy: { candleTimestamp: 'asc' } },
      },
    });

    const positionLog = updatedPosition?.positionLogs.find(
      (l) => l.candleTimestamp.getTime() === ohlcData.timestamp.getTime()
    );

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
