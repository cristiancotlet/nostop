import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { analyzePositionProgressFromDTO } from '@/lib/ai/position-monitor';
import { buildPositionAnalysisContext, formatContextForPrompt } from '@/lib/ai/position-analysis-context';
import { formatRulesForPrompt } from '@/lib/strategy-rules';
import { calculateSwingZone, calculateSwingRays, SwingZoneSettings } from '@/lib/indicators/custom-indicator';
import { computeTicksPnL } from '@/lib/instruments';

const ohlcSchema = z.object({
  timestamp: z.union([z.string(), z.date()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

const logSchema = z.object({
  candleTimestamp: z.union([z.string(), z.date()]),
  conclusion: z.string(),
  close: z.number(),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  ticksPnL: z.number().optional(),
});

const backtestPositionAnalyzeSchema = z.object({
  strategyId: z.string().optional(),
  chartData: z.array(ohlcSchema).optional(),
  entrySignal: z.string(),
  entryPrice: z.number(),
  entryCandle: ohlcSchema.optional(),
  initialReasoning: z.string(),
  positionLogs: z.array(logSchema),
  newCandle: ohlcSchema,
  candleCount: z.number(),
  instrumentType: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = backtestPositionAnalyzeSchema.parse(body);

    let strategyRules = '';
    let swingZone: { swingHighs: Array<{ price: number }>; swingLows: Array<{ price: number }>; rayHighs?: Array<{ price: number }>; rayLows?: Array<{ price: number }>; regime?: { regime?: string } } | undefined;
    let recentCandles: Array<{ ts: string; o: number; h: number; l: number; c: number }> | undefined;

    if (parsed.strategyId) {
      const strategy = await prisma.strategy.findUnique({
        where: { id: parsed.strategyId },
      });
      if (strategy?.rules) strategyRules = formatRulesForPrompt(strategy.rules);
    }

    if (parsed.chartData && parsed.chartData.length > 0) {
      const swingZoneSettings: SwingZoneSettings = {
        showHighs: true,
        showLows: true,
        sensitivity: 2,
        maxSwingPoints: 2,
        showRegime: true,
        fastMALength: 21,
        slowMALength: 50,
        regimeConfirmationBars: 2,
        enableRays: true,
        raySensitivity: 2,
        numRaysToShow: 3,
        rayLineWidth: 2,
        rayOpacity: 50,
      };

      const chartDataForIndicator = parsed.chartData.slice(-100).map((c) => ({
        high: c.high,
        low: c.low,
        close: c.close,
        timestamp: typeof c.timestamp === 'string' ? c.timestamp : new Date(c.timestamp).toISOString(),
      }));

      swingZone = calculateSwingZone(chartDataForIndicator, swingZoneSettings);
      const rays = calculateSwingRays(chartDataForIndicator, swingZoneSettings);
      swingZone = { ...swingZone, rayHighs: rays.rayHighs, rayLows: rays.rayLows };

      recentCandles = parsed.chartData.slice(-20).map((c) => ({
        ts: typeof c.timestamp === 'string' ? c.timestamp : new Date(c.timestamp).toISOString(),
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
      }));
    }

    // Build full price evolution since entry (entry + all logs + new candle) for trajectory analysis
    const priceEvolutionSinceEntry: Array<{ ts: string; o: number; h: number; l: number; c: number }> = [];
    if (parsed.entryCandle) {
      priceEvolutionSinceEntry.push({
        ts: typeof parsed.entryCandle.timestamp === 'string' ? parsed.entryCandle.timestamp : new Date(parsed.entryCandle.timestamp).toISOString(),
        o: parsed.entryCandle.open,
        h: parsed.entryCandle.high,
        l: parsed.entryCandle.low,
        c: parsed.entryCandle.close,
      });
    }
    for (const log of parsed.positionLogs) {
      const o = log.open ?? log.close;
      const h = log.high ?? log.close;
      const l = log.low ?? log.close;
      priceEvolutionSinceEntry.push({
        ts: typeof log.candleTimestamp === 'string' ? log.candleTimestamp : new Date(log.candleTimestamp).toISOString(),
        o,
        h,
        l,
        c: log.close,
      });
    }
    priceEvolutionSinceEntry.push({
      ts: typeof parsed.newCandle.timestamp === 'string' ? parsed.newCandle.timestamp : new Date(parsed.newCandle.timestamp).toISOString(),
      o: parsed.newCandle.open,
      h: parsed.newCandle.high,
      l: parsed.newCandle.low,
      c: parsed.newCandle.close,
    });

    const contextSections = buildPositionAnalysisContext({
      strategyRules: strategyRules || undefined,
      swingZone,
      recentCandles,
      priceEvolutionSinceEntry: priceEvolutionSinceEntry.length > 0 ? priceEvolutionSinceEntry : undefined,
      priceTrajectory: swingZone
        ? {
            entrySignal: parsed.entrySignal,
            entryPrice: parsed.entryPrice,
            currentPrice: parsed.newCandle.close,
            newCandle: parsed.newCandle,
            swingHighs: swingZone.swingHighs,
            swingLows: swingZone.swingLows,
            rayHighs: swingZone.rayHighs,
            rayLows: swingZone.rayLows,
            recentCandles: recentCandles?.map((c) => ({ o: c.o, h: c.h, l: c.l, c: c.c })),
          }
        : undefined,
    });
    const contextSectionsFormatted = formatContextForPrompt(contextSections);

    const newCandleTicksPnL = computeTicksPnL(
      parsed.entrySignal,
      parsed.entryPrice,
      parsed.newCandle.close,
      parsed.instrumentType || 'CL'
    );

    const result = await analyzePositionProgressFromDTO({
      entrySignal: parsed.entrySignal,
      entryPrice: parsed.entryPrice,
      initialReasoning: parsed.initialReasoning,
      positionLogs: parsed.positionLogs.map((log) => ({
        candleTimestamp: log.candleTimestamp,
        conclusion: log.conclusion,
        close: log.close,
        ticksPnL: log.ticksPnL,
      })),
      newCandle: {
        timestamp: parsed.newCandle.timestamp,
        open: parsed.newCandle.open,
        high: parsed.newCandle.high,
        low: parsed.newCandle.low,
        close: parsed.newCandle.close,
      },
      newCandleTicksPnL,
      currentCandleCount: parsed.candleCount,
      recommendationMode: true,
      contextSections: contextSectionsFormatted || undefined,
    });

    return NextResponse.json({
      success: true,
      data: { conclusion: result.conclusion },
    });
  } catch (error: any) {
    console.error('Backtest position-analyze error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to analyze position' },
      { status: 500 }
    );
  }
}
