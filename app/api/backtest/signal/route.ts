import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { analyzeChartForSignal } from '@/lib/ai/chart-analysis';
import { formatRulesForPrompt } from '@/lib/strategy-rules';
import { calculateSwingZone, calculateSwingRays, SwingZoneSettings } from '@/lib/indicators/custom-indicator';

const ohlcSchema = z.object({
  timestamp: z.union([z.string(), z.date()]),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

const backtestSignalSchema = z.object({
  strategyId: z.string(),
  chartData: z.array(ohlcSchema).min(1),
  currentCandle: ohlcSchema,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategyId, chartData: rawChartData, currentCandle: rawCurrentCandle } =
      backtestSignalSchema.parse(body);

    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Use last 100 candles (same as generate route)
    const chartData = rawChartData.slice(-100).map((c) => ({
      timestamp: typeof c.timestamp === 'string' ? new Date(c.timestamp) : c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const currentCandle = {
      timestamp: typeof rawCurrentCandle.timestamp === 'string'
        ? new Date(rawCurrentCandle.timestamp)
        : rawCurrentCandle.timestamp,
      open: rawCurrentCandle.open,
      high: rawCurrentCandle.high,
      low: rawCurrentCandle.low,
      close: rawCurrentCandle.close,
    };

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

    const indicatorData = chartData.map((candle) => ({
      high: candle.high,
      low: candle.low,
      close: candle.close,
      timestamp: candle.timestamp instanceof Date
        ? candle.timestamp.toISOString()
        : new Date(candle.timestamp).toISOString(),
    }));

    const swingZone = calculateSwingZone(indicatorData, swingZoneSettings);
    const swingRays = calculateSwingRays(indicatorData, swingZoneSettings);

    const swingHighs = swingZone.swingHighs.map((swing) => swing.price);
    const swingLows = swingZone.swingLows.map((swing) => swing.price);

    const formatSwingPoints = (swings: typeof swingZone.swingHighs) => {
      return swings.map((swing) => {
        const timeValue = typeof swing.time === 'number' ? swing.time : parseInt(String(swing.time));
        return {
          price: swing.price,
          timestamp: new Date(timeValue * 1000).toISOString(),
          barIndex: swing.barIndex,
        };
      });
    };

    const indicatorLevels = {
      support: swingLows,
      resistance: swingHighs,
      swingHighs: formatSwingPoints(swingZone.swingHighs),
      swingLows: formatSwingPoints(swingZone.swingLows),
      rayHighs: formatSwingPoints(swingRays.rayHighs),
      rayLows: formatSwingPoints(swingRays.rayLows),
      regime: swingZone.regime,
    };

    const aiResult = await analyzeChartForSignal(
      chartData,
      formatRulesForPrompt(strategy.rules),
      currentCandle,
      indicatorLevels,
      { concise: true }
    );

    return NextResponse.json({
      success: true,
      data: { signal: aiResult.signal, reasoning: aiResult.reasoning },
    });
  } catch (error: any) {
    console.error('Backtest signal error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    if (error.message?.includes('OPENAI_API_KEY') || error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to generate backtest signal' },
      { status: 500 }
    );
  }
}
