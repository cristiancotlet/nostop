import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { processPositionLogsForNewCandle } from '@/lib/position-log-processor';

const ohlcSchema = z.object({
  timestamp: z.string().transform((str) => new Date(str)),
  instrument: z.string(),
  timeframe: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = ohlcSchema.parse(body);

    const ohlcData = await prisma.oHLCData.create({
      data,
    });

    // Automatically process position logs for open positions matching this instrument/timeframe
    // Don't await - let it run in background to avoid blocking the response
    processPositionLogsForNewCandle(ohlcData.id, data.instrument, data.timeframe).catch((error) => {
      console.error('Error processing position logs for new candle:', error);
    });

    return NextResponse.json({
      success: true,
      data: ohlcData,
    });
  } catch (error: any) {
    console.error('Manual OHLC entry error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create OHLC data' },
      { status: 500 }
    );
  }
}
