import { getOpenAIClient } from './client';
import { Position, Signal, OHLCData, PositionLog, Strategy } from '@prisma/client';
import { calculateSwingZone, SwingZoneSettings } from '@/lib/indicators/custom-indicator';
import { formatRulesForPrompt } from '@/lib/strategy-rules';

interface PositionWithRelations extends Position {
  signal: Signal & {
    ohlcData?: OHLCData | null;
    strategy?: Strategy | null;
  };
  positionLogs: (PositionLog & {
    ohlcData?: OHLCData | null;
    closePrice?: number | null;
  })[];
}

interface PositionLearningResult {
  insights: string[];
}

/** Extended DTO for backtest with full context */
export interface PositionLearningDTO {
  entrySignal: string;
  entryPrice: number;
  initialReasoning: string;
  strategyRules: string;
  instrumentType?: string;
  entryCandle: { timestamp: string | Date; open: number; high: number; low: number; close: number };
  positionLogs: Array<{
    candleTimestamp: string | Date;
    open: number;
    high: number;
    low: number;
    close: number;
    conclusion: string;
    ticksPnL?: number;
  }>;
  exitCandle: { timestamp: string | Date; open: number; high: number; low: number; close: number };
  chartData: Array<{ timestamp: string; open: number; high: number; low: number; close: number }>;
  /** Extended chart context (e.g. 100 candles) for Swing Zone indicator. Uses chartData if not provided. */
  chartDataForIndicator?: Array<{ timestamp: string; open: number; high: number; low: number; close: number }>;
  finalTicksPnL: number;
}

function buildLearningPrompt(dto: PositionLearningDTO): string {
  const { entrySignal, entryPrice, initialReasoning, strategyRules, entryCandle, positionLogs, exitCandle, chartData, chartDataForIndicator, finalTicksPnL } = dto;
  const indicatorChartData = chartDataForIndicator ?? chartData;

  const wasProfitable = entrySignal === 'BUY' ? finalTicksPnL > 0 : finalTicksPnL < 0;

  // 1. REAL DATA: Price evolution (OHLC) + P/L in ticks at each candle
  const entryTs = typeof entryCandle.timestamp === 'string' ? entryCandle.timestamp : new Date(entryCandle.timestamp).toISOString();
  const priceEvolution: string[] = [];
  priceEvolution.push(`Candle 0 (ENTRY): ${entryTs} | O: ${entryCandle.open} H: ${entryCandle.high} L: ${entryCandle.low} C: ${entryCandle.close} | P/L: 0 ticks (entry)`);

  if (positionLogs.length === 0) {
    const exitTs = typeof exitCandle.timestamp === 'string' ? exitCandle.timestamp : new Date(exitCandle.timestamp).toISOString();
    priceEvolution.push(`Candle 1 (EXIT): ${exitTs} | O: ${exitCandle.open} H: ${exitCandle.high} L: ${exitCandle.low} C: ${exitCandle.close} | P/L: FINAL ${finalTicksPnL >= 0 ? '+' : ''}${finalTicksPnL} ticks`);
  } else {
    positionLogs.forEach((log, i) => {
      const ts = typeof log.candleTimestamp === 'string' ? log.candleTimestamp : new Date(log.candleTimestamp).toISOString();
      const ticks = log.ticksPnL != null ? `${log.ticksPnL >= 0 ? '+' : ''}${log.ticksPnL} ticks` : '—';
      const isExit = i === positionLogs.length - 1;
      priceEvolution.push(`Candle ${i + 1}${isExit ? ' (EXIT)' : ''}: ${ts} | O: ${log.open} H: ${log.high} L: ${log.low} C: ${log.close} | P/L: ${isExit ? `FINAL ${finalTicksPnL >= 0 ? '+' : ''}${finalTicksPnL} ticks` : ticks}`);
    });
  }

  // 2. INDICATOR: Swing Zone levels from chart data (need at least 6 bars for pivot, 50 for regime)
  let indicatorSection = 'Indicator data not available (insufficient chart data).';
  if (indicatorChartData.length >= 6) {
    const swingSettings: SwingZoneSettings = {
      showHighs: true,
      showLows: true,
      sensitivity: 2,
      maxSwingPoints: 3,
      showRegime: indicatorChartData.length >= 50,
      fastMALength: 21,
      slowMALength: 50,
    };
    const swingZone = calculateSwingZone(indicatorChartData, swingSettings);
    indicatorSection = [
      `Swing highs (resistance): ${swingZone.swingHighs.map((s) => s.price.toFixed(4)).join(', ') || 'none'}`,
      `Swing lows (support): ${swingZone.swingLows.map((s) => s.price.toFixed(4)).join(', ') || 'none'}`,
      `Regime: ${swingZone.regime?.regime || 'N/A'}`,
    ].join('\n');
  }

  // 3. AI HISTORY: Initial signal + each candle's AI recommendation
  const aiHistory: string[] = [];
  aiHistory.push(`INITIAL SIGNAL (${entrySignal} @ ${entryPrice}): "${initialReasoning}"`);
  positionLogs.forEach((log, i) => {
    aiHistory.push(`Candle ${i + 1} AI recommendation: "${log.conclusion}"`);
  });

  return `You are analyzing ONE closed trading position. Your 3 conclusions MUST be specific to THIS position. Use the exact data below. The outcome in TICKS is the source of truth—do not contradict it.

=== OUTCOME (TICKS - this is accurate) ===
Entry: ${entrySignal} @ ${entryPrice}
Exit: ${exitCandle.close}
Final P/L: ${finalTicksPnL >= 0 ? '+' : ''}${finalTicksPnL} ticks
Result: ${wasProfitable ? 'PROFITABLE' : 'UNPROFITABLE'} (${finalTicksPnL >= 0 ? '+' : ''}${finalTicksPnL} ticks)

=== 1. REAL DATA: Price evolution (OHLC) + P/L in ticks at each candle ===
${priceEvolution.join('\n')}

=== 2. INDICATOR: Swing Zone levels during the position ===
${indicatorSection}

=== 3. AI HISTORY: All AI recommendations ===
${aiHistory.join('\n')}

=== STRATEGY RULES ===
${strategyRules}

Write exactly 3 insights. For THIS position only:
1. Signal quality: Was the entry signal right or wrong? Use the actual outcome (${finalTicksPnL} ticks) and the price evolution. Be specific.
2. Strategy vs reality: What from the strategy was confirmed or broken by the indicator levels (swing highs/lows), price path, and final P/L?
3. Exit timing: Based on the price path and indicator levels, was exiting at this point optimal or could it have been earlier/later? What does the data suggest?

CRITICAL: Do NOT justify or defend the AI's recommendations. Focus on what the data shows and what can be learned. Do not say things like "the AI did not miss anything" or "the AI recommendations were correct."

Be concise. Reference specific numbers, ticks, and this trade only. No generic advice. If the outcome was good (e.g. +129 ticks), say so. If bad, explain what went wrong.

Format as JSON:
{
  "insights": [
    "First insight—specific to this position...",
    "Second insight—specific to this position...",
    "Third insight—specific to this position..."
  ]
}`;
}

export async function analyzeClosedPositionFromDTO(
  dto: PositionLearningDTO
): Promise<PositionLearningResult> {
  const { entrySignal, exitCandle, finalTicksPnL } = dto;
  const wasProfitable = entrySignal === 'BUY' ? finalTicksPnL > 0 : finalTicksPnL < 0;

  const prompt = buildLearningPrompt(dto);

  try {
    const openai = await getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You extract 3 learning insights from a single closed position. Each insight must be specific to that trade. Use the exact data provided: price evolution (OHLC), P/L in TICKS at each candle, indicator levels (swing highs/lows), and AI recommendations. The final P/L in ticks is accurate—do not say the outcome was bad when ticks show profit. Do NOT justify or defend the AI\'s recommendations. Focus on what the data shows. Always valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const response = JSON.parse(
      completion.choices[0]?.message?.content || '{}'
    );

    const insights = Array.isArray(response.insights)
      ? response.insights.slice(0, 3)
      : [];

    while (insights.length < 3) {
      insights.push(`Insight ${insights.length + 1}: Analysis pending`);
    }

    return {
      insights: insights.slice(0, 3),
    };
  } catch (error) {
    console.error('AI position learning error (DTO):', error);
    return {
      insights: [
        `Signal ${wasProfitable ? 'good' : 'bad'}: ${entrySignal} resulted in ${finalTicksPnL >= 0 ? '+' : ''}${finalTicksPnL} ticks ${wasProfitable ? 'profit' : 'loss'}.`,
        `Strategy ${wasProfitable ? 'validated' : 'needs review'}: ${dto.positionLogs.length + 1} candles from entry to exit.`,
        `Price action ${wasProfitable ? 'confirmed' : 'rejected'} the entry decision.`,
      ],
    };
  }
}

export async function analyzeClosedPosition(
  position: PositionWithRelations
): Promise<PositionLearningResult> {
  const entryPrice = position.entryPrice ?? position.signal.ohlcData?.close;
  if (entryPrice == null) {
    throw new Error('Position has no entry price (ohlcData was deleted and entryPrice not set)');
  }
  const entrySignal = position.signal.signal;
  const initialReasoning = position.signal.reasoning || 'No initial reasoning provided';
  const rawRules = position.signal.strategy?.rules || 'No strategy rules available';
  const strategyRules = formatRulesForPrompt(rawRules);

  const latestLog = position.positionLogs[position.positionLogs.length - 1];
  const exitPrice = latestLog?.closePrice ?? latestLog?.ohlcData?.close ?? entryPrice;

  const ticksPnL = 0; // Would need instrument type to compute; use 0 for legacy flow
  const wasProfitable = entrySignal === 'BUY' ? exitPrice > entryPrice : exitPrice < entryPrice;

  const entryOhlc = position.signal.ohlcData;
  const entryCandle = entryOhlc
    ? {
        timestamp: entryOhlc.timestamp.toISOString(),
        open: entryOhlc.open,
        high: entryOhlc.high,
        low: entryOhlc.low,
        close: entryOhlc.close,
      }
    : {
        timestamp: position.entryConfirmedAt?.toISOString() ?? new Date().toISOString(),
        open: entryPrice,
        high: entryPrice,
        low: entryPrice,
        close: entryPrice,
      };

  const positionLogs = position.positionLogs.map((log) => {
    const close = log.closePrice ?? log.ohlcData?.close ?? entryPrice;
    const o = log.ohlcData;
    return {
      candleTimestamp: log.candleTimestamp.toISOString(),
      open: o?.open ?? close,
      high: o?.high ?? close,
      low: o?.low ?? close,
      close,
      conclusion: log.conclusion,
      ticksPnL: log.ticksPnL ?? undefined,
    };
  });

  const exitCandle = latestLog
    ? latestLog.ohlcData
      ? {
          timestamp: latestLog.ohlcData.timestamp.toISOString(),
          open: latestLog.ohlcData.open,
          high: latestLog.ohlcData.high,
          low: latestLog.ohlcData.low,
          close: latestLog.ohlcData.close,
        }
      : {
          timestamp: latestLog.candleTimestamp.toISOString(),
          open: (latestLog.closePrice ?? entryPrice),
          high: (latestLog.closePrice ?? entryPrice),
          low: (latestLog.closePrice ?? entryPrice),
          close: (latestLog.closePrice ?? entryPrice),
        }
    : entryCandle;

  const chartData = [entryCandle, ...positionLogs.map((l) => ({
    timestamp: l.candleTimestamp,
    open: l.open,
    high: l.high,
    low: l.low,
    close: l.close,
  }))];

  return analyzeClosedPositionFromDTO({
    entrySignal,
    entryPrice,
    initialReasoning,
    strategyRules,
    entryCandle,
    positionLogs,
    exitCandle,
    chartData,
    finalTicksPnL: latestLog?.ticksPnL ?? ticksPnL,
  });
}
