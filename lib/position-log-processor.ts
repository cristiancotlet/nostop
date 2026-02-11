import { prisma } from '@/lib/db';
import { analyzePositionProgress } from '@/lib/ai/position-monitor';

/**
 * Automatically process position logs for all open positions when a new candle is added
 * This checks for open positions matching the instrument/timeframe and creates logs
 */
export async function processPositionLogsForNewCandle(
  ohlcDataId: string,
  instrument: string,
  timeframe: string
): Promise<void> {
  try {
    // Find all open positions for this instrument/timeframe
    const openPositions = await prisma.position.findMany({
      where: {
        status: 'OPEN',
        signal: {
          instrument,
          timeframe,
        },
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

    if (openPositions.length === 0) {
      return; // No open positions to process
    }

    // Fetch the new candle data
    const newCandleData = await prisma.oHLCData.findUnique({
      where: { id: ohlcDataId },
    });

    if (!newCandleData) {
      console.error(`OHLC data not found: ${ohlcDataId}`);
      return;
    }

    // Process each open position
    for (const position of openPositions) {
      // Skip if position is closed or has reached max candle count
      if (position.status === 'CLOSED' || position.currentCandleCount >= 10) {
        continue;
      }

      // Check if we already have a log for this candle timestamp
      const existingLog = position.positionLogs.find(
        (log) => log.candleTimestamp.getTime() === newCandleData.timestamp.getTime()
      );

      if (existingLog) {
        continue; // Already processed this candle
      }

      try {
        // Analyze position progress with AI
        const aiResult = await analyzePositionProgress(position, newCandleData);

        // Create position log
        await prisma.positionLog.create({
          data: {
            positionId: position.id,
            candleTimestamp: newCandleData.timestamp,
            conclusion: aiResult.conclusion,
            ohlcDataId,
            closePrice: newCandleData.close,
          },
        });

        // Update position candle count
        await prisma.position.update({
          where: { id: position.id },
          data: {
            currentCandleCount: position.currentCandleCount + 1,
          },
        });
      } catch (error) {
        console.error(`Error processing log for position ${position.id}:`, error);
        // Continue with other positions even if one fails
      }
    }
  } catch (error) {
    console.error('Error in processPositionLogsForNewCandle:', error);
    // Don't throw - this is a background process
  }
}
