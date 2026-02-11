import { prisma } from '@/lib/db';
import { analyzePositionProgressFromDTO } from '@/lib/ai/position-monitor';
import { buildPositionAnalysisContext, formatContextForPrompt } from '@/lib/ai/position-analysis-context';
import { formatRulesForPrompt } from '@/lib/strategy-rules';
import { calculateSwingZone, calculateSwingRays, SwingZoneSettings } from '@/lib/indicators/custom-indicator';
import { computeTicksPnL } from '@/lib/instruments';

/**
 * Automatically process position logs for all open positions when a new candle is added
 * Uses recommendation mode (HOLD/EXIT) with full indicator and price context
 * @param positionId - Optional: process only this position (e.g. for manual log add)
 */
export async function processPositionLogsForNewCandle(
  ohlcDataId: string,
  instrument: string,
  timeframe: string,
  positionId?: string
): Promise<void> {
  try {
    const openPositions = await prisma.position.findMany({
      where: {
        ...(positionId ? { id: positionId } : {}),
        status: 'OPEN',
        signal: { instrument, timeframe },
      },
      include: {
        signal: {
          include: {
            strategy: true,
            ohlcData: true,
          },
        },
        positionLogs: {
          include: { ohlcData: true },
          orderBy: { candleTimestamp: 'asc' },
        },
      },
    });

    if (openPositions.length === 0) return;

    const newCandleData = await prisma.oHLCData.findUnique({
      where: { id: ohlcDataId },
    });

    if (!newCandleData) {
      console.error(`OHLC data not found: ${ohlcDataId}`);
      return;
    }

    // Fetch recent OHLC for indicator context (last 100 candles up to and including new candle)
    const recentOhlcRaw = await prisma.oHLCData.findMany({
      where: { instrument, timeframe, timestamp: { lte: newCandleData.timestamp } },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    const recentOhlc = recentOhlcRaw.reverse();
    const chartDataForIndicator = recentOhlc.map((c) => ({
      high: c.high,
      low: c.low,
      close: c.close,
      timestamp: c.timestamp.toISOString(),
    }));

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

    let swingZone: { swingHighs: Array<{ price: number }>; swingLows: Array<{ price: number }>; rayHighs?: Array<{ price: number }>; rayLows?: Array<{ price: number }>; regime?: { regime?: string } } | undefined;
    let recentCandles: Array<{ ts: string; o: number; h: number; l: number; c: number }> | undefined;

    if (chartDataForIndicator.length > 0) {
      swingZone = calculateSwingZone(chartDataForIndicator, swingZoneSettings);
      const rays = calculateSwingRays(chartDataForIndicator, swingZoneSettings);
      swingZone = { ...swingZone, rayHighs: rays.rayHighs, rayLows: rays.rayLows };
      recentCandles = recentOhlc.slice(-20).map((c) => ({
        ts: c.timestamp.toISOString(),
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
      }));
    }

    for (const position of openPositions) {
      if (position.status === 'CLOSED' || position.currentCandleCount >= 10) continue;

      const existingLog = position.positionLogs.find(
        (log) => log.candleTimestamp.getTime() === newCandleData.timestamp.getTime()
      );
      if (existingLog) continue;

      const entryPrice = position.entryPrice ?? position.signal.ohlcData?.close;
      if (entryPrice == null) {
        console.error(`Position ${position.id} has no entry price`);
        continue;
      }

      const positionLogs = position.positionLogs.map((log) => {
        const ohlc = log.ohlcData;
        return {
          candleTimestamp: log.candleTimestamp.toISOString(),
          conclusion: log.conclusion,
          close: log.closePrice ?? ohlc?.close ?? 0,
          ticksPnL: log.ticksPnL ?? undefined,
        };
      });

      const priceEvolutionSinceEntry: Array<{ ts: string; o: number; h: number; l: number; c: number }> = [];
      const entryOhlc = position.signal.ohlcData;
      if (entryOhlc) {
        priceEvolutionSinceEntry.push({
          ts: entryOhlc.timestamp.toISOString(),
          o: entryOhlc.open,
          h: entryOhlc.high,
          l: entryOhlc.low,
          c: entryOhlc.close,
        });
      }
      for (const log of position.positionLogs) {
        const o = log.ohlcData;
        priceEvolutionSinceEntry.push({
          ts: log.candleTimestamp.toISOString(),
          o: o?.open ?? log.closePrice ?? 0,
          h: o?.high ?? log.closePrice ?? 0,
          l: o?.low ?? log.closePrice ?? 0,
          c: log.closePrice ?? o?.close ?? 0,
        });
      }
      priceEvolutionSinceEntry.push({
        ts: newCandleData.timestamp.toISOString(),
        o: newCandleData.open,
        h: newCandleData.high,
        l: newCandleData.low,
        c: newCandleData.close,
      });

      const contextSections = buildPositionAnalysisContext({
        strategyRules: position.signal.strategy?.rules ? formatRulesForPrompt(position.signal.strategy.rules) : undefined,
        swingZone,
        recentCandles,
        priceEvolutionSinceEntry,
        priceTrajectory: swingZone
          ? {
              entrySignal: position.signal.signal,
              entryPrice,
              currentPrice: newCandleData.close,
              newCandle: { open: newCandleData.open, high: newCandleData.high, low: newCandleData.low, close: newCandleData.close },
              swingHighs: swingZone.swingHighs,
              swingLows: swingZone.swingLows,
              rayHighs: swingZone.rayHighs,
              rayLows: swingZone.rayLows,
            }
          : undefined,
      });
      const contextSectionsFormatted = formatContextForPrompt(contextSections);

      const newCandleTicksPnL = computeTicksPnL(
        position.signal.signal,
        entryPrice,
        newCandleData.close,
        'CL' // Default; could be inferred from instrument if needed
      );

      try {
        const aiResult = await analyzePositionProgressFromDTO({
          entrySignal: position.signal.signal,
          entryPrice,
          initialReasoning: position.signal.reasoning || 'No initial reasoning',
          positionLogs,
          newCandle: {
            timestamp: newCandleData.timestamp.toISOString(),
            open: newCandleData.open,
            high: newCandleData.high,
            low: newCandleData.low,
            close: newCandleData.close,
          },
          newCandleTicksPnL,
          currentCandleCount: position.currentCandleCount,
          recommendationMode: true,
          contextSections: contextSectionsFormatted || undefined,
        });

        await prisma.positionLog.create({
          data: {
            positionId: position.id,
            candleTimestamp: newCandleData.timestamp,
            conclusion: aiResult.conclusion,
            ohlcDataId,
            closePrice: newCandleData.close,
            ticksPnL: newCandleTicksPnL,
          },
        });

        await prisma.position.update({
          where: { id: position.id },
          data: { currentCandleCount: position.currentCandleCount + 1 },
        });
      } catch (error) {
        console.error(`Error processing log for position ${position.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in processPositionLogsForNewCandle:', error);
  }
}
