import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeClosedPositionFromDTO } from '@/lib/ai/position-learning';

const ohlcSchema = z.object({
  timestamp: z.union([z.string(), z.date()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

const logSchema = z.object({
  candleTimestamp: z.union([z.string(), z.date()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  conclusion: z.string(),
  ticksPnL: z.number().optional(),
});

const backtestPositionLearningSchema = z.object({
  entrySignal: z.string(),
  entryPrice: z.number(),
  initialReasoning: z.string(),
  strategyRules: z.string(),
  instrumentType: z.string().optional(),
  entryCandle: ohlcSchema,
  positionLogs: z.array(logSchema),
  exitCandle: ohlcSchema,
  chartData: z.array(ohlcSchema),
  chartDataForIndicator: z.array(ohlcSchema).optional(),
  finalTicksPnL: z.number(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = backtestPositionLearningSchema.parse(body);

    const result = await analyzeClosedPositionFromDTO({
      entrySignal: parsed.entrySignal,
      entryPrice: parsed.entryPrice,
      initialReasoning: parsed.initialReasoning,
      strategyRules: parsed.strategyRules,
      instrumentType: parsed.instrumentType,
      entryCandle: parsed.entryCandle,
      positionLogs: parsed.positionLogs.map((log) => ({
        candleTimestamp: log.candleTimestamp,
        open: log.open,
        high: log.high,
        low: log.low,
        close: log.close,
        conclusion: log.conclusion,
        ticksPnL: log.ticksPnL,
      })),
      exitCandle: parsed.exitCandle,
      chartData: parsed.chartData.map((c) => ({
        timestamp: typeof c.timestamp === 'string' ? c.timestamp : new Date(c.timestamp).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
      chartDataForIndicator: parsed.chartDataForIndicator?.map((c) => ({
        timestamp: typeof c.timestamp === 'string' ? c.timestamp : new Date(c.timestamp).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
      finalTicksPnL: parsed.finalTicksPnL,
    });

    return NextResponse.json({
      success: true,
      data: { insights: result.insights },
    });
  } catch (error: any) {
    console.error('Backtest position-learning error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to generate learning insights' },
      { status: 500 }
    );
  }
}
