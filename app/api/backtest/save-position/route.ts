import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const ohlcSchema = z.object({
  timestamp: z.union([z.string(), z.date()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

const logSchema = z.object({
  candleTimestamp: z.union([z.string(), z.date()]),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number(),
  conclusion: z.string(),
  ticksPnL: z.number().optional(),
});

const savePositionSchema = z.object({
  instrument: z.string(),
  timeframe: z.string(),
  strategyId: z.string(),
  signal: z.string(),
  reasoning: z.string(),
  entryCandle: ohlcSchema,
  positionLogs: z.array(logSchema),
  learningInsights: z.array(z.string()),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = savePositionSchema.parse(body);

    const entryTs = typeof parsed.entryCandle.timestamp === 'string'
      ? new Date(parsed.entryCandle.timestamp)
      : parsed.entryCandle.timestamp;

    const entryOhlc = await prisma.oHLCData.create({
      data: {
        timestamp: entryTs,
        instrument: parsed.instrument,
        timeframe: parsed.timeframe,
        open: parsed.entryCandle.open,
        high: parsed.entryCandle.high,
        low: parsed.entryCandle.low,
        close: parsed.entryCandle.close,
      },
    });

    const signal = await prisma.signal.create({
      data: {
        instrument: parsed.instrument,
        timeframe: parsed.timeframe,
        signal: parsed.signal,
        reasoning: parsed.reasoning,
        strategyId: parsed.strategyId,
        ohlcDataId: entryOhlc.id,
        timestamp: entryTs,
      },
    });

    const now = new Date();
    const position = await prisma.position.create({
      data: {
        signalId: signal.id,
        entryPrice: parsed.entryCandle.close,
        status: 'CLOSED',
        entryConfirmedAt: entryTs,
        exitConfirmedAt: now,
        currentCandleCount: parsed.positionLogs.length,
        learningInsights: JSON.stringify(parsed.learningInsights),
      },
    });

    for (const log of parsed.positionLogs) {
      const logTs = typeof log.candleTimestamp === 'string'
        ? new Date(log.candleTimestamp)
        : log.candleTimestamp;
      const logOhlc = await prisma.oHLCData.create({
        data: {
          timestamp: logTs,
          instrument: parsed.instrument,
          timeframe: parsed.timeframe,
          open: log.open ?? log.close,
          high: log.high ?? log.close,
          low: log.low ?? log.close,
          close: log.close,
        },
      });
      await prisma.positionLog.create({
        data: {
          positionId: position.id,
          candleTimestamp: logTs,
          conclusion: log.conclusion,
          ohlcDataId: logOhlc.id,
          closePrice: log.close,
          ticksPnL: log.ticksPnL,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { positionId: position.id },
    });
  } catch (error: any) {
    console.error('Backtest save-position error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to save position' },
      { status: 500 }
    );
  }
}
