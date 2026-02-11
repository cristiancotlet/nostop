import { getOpenAIClient } from './client';
import { Position, Signal, OHLCData, PositionLog, Strategy } from '@prisma/client';

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

interface MonitorResult {
  conclusion: string;
}

/** DTO for backtest: plain objects, no Prisma. */
export interface PositionMonitorDTO {
  entrySignal: string;
  entryPrice: number;
  initialReasoning: string;
  positionLogs: Array<{ candleTimestamp: string | Date; conclusion: string; close: number; ticksPnL?: number }>;
  newCandle: { timestamp: string | Date; open: number; high: number; low: number; close: number };
  /** Ticks in profit (+) or loss (-) at this new candle close */
  newCandleTicksPnL?: number;
  currentCandleCount: number;
  /** When true, output is HOLD/EXIT recommendation with short reason (backtest). */
  recommendationMode?: boolean;
  /** Strategy rules for context */
  strategyRules?: string;
  /** Indicator data (Swing Zone levels, recent candles) for price action analysis */
  indicatorContext?: string;
  /** Formatted context sections (strategy, indicator, price trajectory, etc). When set, overrides strategyRules + indicatorContext. */
  contextSections?: string;
}

export async function analyzePositionProgressFromDTO(
  dto: PositionMonitorDTO
): Promise<MonitorResult> {
  const entryPrice = dto.entryPrice;
  const currentPrice = dto.newCandle.close;
  const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
  const entrySignal = dto.entrySignal;
  const initialReasoning = dto.initialReasoning;

  let isPerformingWell = false;
  if (entrySignal === 'BUY') {
    isPerformingWell = currentPrice > entryPrice;
  } else if (entrySignal === 'SELL') {
    isPerformingWell = currentPrice < entryPrice;
  }

  const previousLogs = dto.positionLogs.map((log) => ({
    timestamp: typeof log.candleTimestamp === 'string' ? log.candleTimestamp : new Date(log.candleTimestamp).toISOString(),
    conclusion: log.conclusion,
    price: log.close,
    ticksPnL: log.ticksPnL != null ? log.ticksPnL : undefined,
  }));

  const ts = typeof dto.newCandle.timestamp === 'string' ? dto.newCandle.timestamp : new Date(dto.newCandle.timestamp).toISOString();

  const candleNum = dto.currentCandleCount + 1;
  const lastLog = previousLogs.length > 0 ? previousLogs[previousLogs.length - 1] : null;

  const ticksTrack = previousLogs.length > 0
    ? previousLogs.map((l, i) => `Candle ${i + 1}: ${l.ticksPnL != null ? `${l.ticksPnL >= 0 ? '+' : ''}${l.ticksPnL} ticks` : '—'}`).join(' | ')
    : 'None yet';
  const newCandleTicks = dto.newCandleTicksPnL != null ? `${dto.newCandleTicksPnL >= 0 ? '+' : ''}${dto.newCandleTicksPnL} ticks` : '—';

  const recommendationPrompt = dto.recommendationMode
    ? `You are re-evaluating an open position. CANDLE ${candleNum}. Recommend HOLD or EXIT.

OBJECTIVE: Be driven by what the market says. Recommend EXIT only when there is an actual market reason—price action, structure, or indicator signaling reversal, exhaustion, or invalidation. Do NOT rush to capture profit if there is no market signal.

KEY RULES:
- EXIT when: price shows reversal at a key level (rejection wick, bearish engulfing at resistance, etc.), momentum clearly exhausts (sequence of weaker candles, failure at level), or structure breaks against the thesis.
- HOLD when: thesis is still valid and the market has not given a reason to exit. Do not exit just because we are in profit or approaching a level—wait for the market to show reaction.
- Avoid bias: neither favor EXIT (to lock gains) nor HOLD (to let run). Let price action, indicators, and structure decide.
- When price moves against us: exit when the market clearly signals no reversal; do not hold hoping.

Analyze the FULL price evolution since entry (not just the latest candle). Use indicator levels, swing zones, rays, and regime. Focus on the latest candle for new signals, but consider the trajectory.

POSITION TYPE: ${entrySignal}
ENTRY: ${entrySignal} @ ${entryPrice}
Reasoning: "${initialReasoning}"

P/L TRACK RECORD (ticks at each candle close—positive = profit, negative = loss):
- Previous: ${ticksTrack}
- This candle: ${newCandleTicks}

THIS CANDLE (candle ${candleNum}—what does it add?):
- Time: ${ts} | O: ${dto.newCandle.open} H: ${dto.newCandle.high} L: ${dto.newCandle.low} C: ${currentPrice}
- Vs entry: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%

${dto.contextSections ? dto.contextSections + '\n\n' : ''}
${!dto.contextSections && dto.strategyRules ? `STRATEGY RULES:\n${dto.strategyRules}\n` : ''}
${!dto.contextSections && dto.indicatorContext ? `INDICATOR & PRICE CONTEXT (Swing Zone):\n${dto.indicatorContext}\n` : ''}

PREVIOUS CONCLUSIONS (do NOT repeat—find what is NEW):
${previousLogs.length > 0 ? previousLogs.map((l, i) => `Candle ${i + 1}: ${l.conclusion}`).join('\n') : 'None yet'}
${lastLog ? `\nLast: "${lastLog.conclusion}" — What CHANGED with this candle?` : ''}

Provide a NEW, specific reason. Output ONLY recommendation and one short reason.

Respond with a JSON object:
{
  "recommendation": "HOLD" or "EXIT",
  "reason": "One short sentence: NEW insight—what changed, what signals exit or hold."
}`
    : `You are monitoring a trading position. Compare the current price action with the initial decision to enter the position and provide a VERY SHORT performance assessment.

INITIAL DECISION (when position was opened):
- Entry Signal: ${entrySignal}
- Entry Price: ${entryPrice}
- Initial Reasoning: "${initialReasoning}"

CURRENT CANDLE:
- Timestamp: ${ts}
- Open: ${dto.newCandle.open}
- High: ${dto.newCandle.high}
- Low: ${dto.newCandle.low}
- Close: ${dto.newCandle.close}
- Current Price: ${currentPrice}
- Price Change from Entry: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%

POSITION STATUS:
- Candles Monitored: ${dto.currentCandleCount + 1}
- Performance: ${isPerformingWell ? 'GOOD' : 'POOR'} (${entrySignal === 'BUY' ? 'Price is ' + (currentPrice > entryPrice ? 'above' : 'below') + ' entry' : entrySignal === 'SELL' ? 'Price is ' + (currentPrice < entryPrice ? 'below' : 'above') + ' entry' : 'N/A'})

PREVIOUS LOGS:
${previousLogs.length > 0 ? JSON.stringify(previousLogs, null, 2) : 'None'}

Provide a VERY SHORT conclusion (1-2 sentences maximum) that:
1. Confirms if the initial decision to enter was GOOD or BAD based on current price action
2. Gives a brief explanation why (e.g., "Good: Price moved as expected" or "Bad: Price reversed against entry signal")

Keep it concise and focused on performance assessment only.

Respond with a JSON object:
{
  "conclusion": "Your very short performance assessment here"
}`;

  const systemContent = dto.recommendationMode
    ? 'You are a market-driven position monitor. Recommend EXIT only when price action, structure, or indicators give an actual reason (reversal at level, exhaustion, structure break). Do not exit just to capture profit—wait for the market to signal. HOLD when thesis is valid and no market reason to exit. Output HOLD or EXIT plus one short, specific reason. Always valid JSON only.'
    : 'You are a trading position monitor. Provide VERY SHORT (1-2 sentences) performance assessments comparing current price action with the initial entry decision. Always respond with valid JSON only.';

  try {
    const openai = await getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: recommendationPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const response = JSON.parse(
      completion.choices[0]?.message?.content || '{}'
    );

    if (dto.recommendationMode && (response.recommendation === 'HOLD' || response.recommendation === 'EXIT')) {
      const rec = (response.recommendation as string).toUpperCase();
      const reason = (response.reason || '').trim() || (rec === 'HOLD' ? 'Thesis still valid.' : 'Exit recommended.');
      return { conclusion: `${rec}: ${reason}` };
    }

    return {
      conclusion: response.conclusion || `Price ${priceChange > 0 ? 'up' : 'down'} ${Math.abs(priceChange).toFixed(2)}% from entry.`,
    };
  } catch (error) {
    console.error('AI position monitoring error (DTO):', error);
    if (dto.recommendationMode) {
      return {
        conclusion: isPerformingWell ? 'HOLD: Price still favorable.' : 'EXIT: Price moved against position.',
      };
    }
    const performance = isPerformingWell ? 'Good' : 'Poor';
    return {
      conclusion: `${performance}: Price ${priceChange > 0 ? 'moved up' : 'moved down'} ${Math.abs(priceChange).toFixed(2)}% from entry.`,
    };
  }
}

export async function analyzePositionProgress(
  position: PositionWithRelations,
  newCandleData: OHLCData
): Promise<MonitorResult> {
  const entryPrice = position.entryPrice ?? position.signal.ohlcData?.close;
  if (entryPrice == null) {
    throw new Error('Position has no entry price (ohlcData was deleted and entryPrice not set)');
  }
  const currentPrice = newCandleData.close;
  const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
  const entrySignal = position.signal.signal; // BUY, SELL, or HOLD
  const initialReasoning = position.signal.reasoning || 'No initial reasoning provided';

  // Determine if position is performing well based on signal type
  let isPerformingWell = false;
  if (entrySignal === 'BUY') {
    isPerformingWell = currentPrice > entryPrice;
  } else if (entrySignal === 'SELL') {
    isPerformingWell = currentPrice < entryPrice;
  }

  const previousLogs = position.positionLogs.map((log) => ({
    timestamp: log.candleTimestamp.toISOString(),
    conclusion: log.conclusion,
    price: log.closePrice ?? log.ohlcData?.close ?? 0,
  }));

  const prompt = `You are monitoring a trading position. Compare the current price action with the initial decision to enter the position and provide a VERY SHORT performance assessment.

INITIAL DECISION (when position was opened):
- Entry Signal: ${entrySignal}
- Entry Price: ${entryPrice}
- Initial Reasoning: "${initialReasoning}"

CURRENT CANDLE:
- Timestamp: ${newCandleData.timestamp.toISOString()}
- Open: ${newCandleData.open}
- High: ${newCandleData.high}
- Low: ${newCandleData.low}
- Close: ${newCandleData.close}
- Current Price: ${currentPrice}
- Price Change from Entry: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%

POSITION STATUS:
- Candles Monitored: ${position.currentCandleCount + 1}
- Performance: ${isPerformingWell ? 'GOOD' : 'POOR'} (${entrySignal === 'BUY' ? 'Price is ' + (currentPrice > entryPrice ? 'above' : 'below') + ' entry' : entrySignal === 'SELL' ? 'Price is ' + (currentPrice < entryPrice ? 'below' : 'above') + ' entry' : 'N/A'})

PREVIOUS LOGS:
${previousLogs.length > 0 ? JSON.stringify(previousLogs, null, 2) : 'None'}

Provide a VERY SHORT conclusion (1-2 sentences maximum) that:
1. Confirms if the initial decision to enter was GOOD or BAD based on current price action
2. Gives a brief explanation why (e.g., "Good: Price moved as expected" or "Bad: Price reversed against entry signal")

Keep it concise and focused on performance assessment only.

Respond with a JSON object:
{
  "conclusion": "Your very short performance assessment here"
}`;

  try {
    const openai = await getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a trading position monitor. Provide VERY SHORT (1-2 sentences) performance assessments comparing current price action with the initial entry decision. Always respond with valid JSON only.',
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

    return {
      conclusion: response.conclusion || `Price ${priceChange > 0 ? 'up' : 'down'} ${Math.abs(priceChange).toFixed(2)}% from entry.`,
    };
  } catch (error) {
    console.error('AI position monitoring error:', error);
    // Fallback conclusion
    const performance = isPerformingWell ? 'Good' : 'Poor';
    return {
      conclusion: `${performance}: Price ${priceChange > 0 ? 'moved up' : 'moved down'} ${Math.abs(priceChange).toFixed(2)}% from entry.`,
    };
  }
}
