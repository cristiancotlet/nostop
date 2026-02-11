import { getOpenAIClient } from './client';

type SignalType = 'BUY' | 'SELL' | 'HOLD';

interface OHLCData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorLevels {
  support?: number[];
  resistance?: number[];
  [key: string]: any;
}

interface AnalysisResult {
  signal: SignalType;
  reasoning: string;
}

export interface AnalyzeChartForSignalOptions {
  /** When true, reasoning is 2-4 short sentences with key findings only (e.g. backtest). */
  concise?: boolean;
}

export async function analyzeChartForSignal(
  chartData: OHLCData[],
  strategyRules: string,
  currentCandle: OHLCData,
  indicatorLevels?: IndicatorLevels,
  options?: AnalyzeChartForSignalOptions
): Promise<AnalysisResult> {
  // Validate input data
  if (!chartData || chartData.length === 0) {
    throw new Error('Chart data is empty');
  }
  if (!currentCandle) {
    throw new Error('Current candle is required');
  }
  if (!strategyRules) {
    throw new Error('Strategy rules are required');
  }

  // Extract indicator levels from chart data (simplified - in real app, calculate from indicator)
  const levels = indicatorLevels || extractLevelsFromData(chartData);

  // Prepare data for AI - ensure timestamp is a Date object
  const recentCandles = chartData.slice(-20).map((candle) => {
    const timestamp = candle.timestamp instanceof Date 
      ? candle.timestamp 
      : new Date(candle.timestamp);
    
    return {
      timestamp: timestamp.toISOString(),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    };
  });

  // Ensure current candle timestamp is a Date object
  const currentCandleTimestamp = currentCandle.timestamp instanceof Date
    ? currentCandle.timestamp
    : new Date(currentCandle.timestamp);

  // Format indicator levels for AI prompt
  const supportLevels = levels.support || [];
  const resistanceLevels = levels.resistance || [];
  const swingHighs = (levels as any).swingHighs || [];
  const swingLows = (levels as any).swingLows || [];
  const rayHighs = (levels as any).rayHighs || [];
  const rayLows = (levels as any).rayLows || [];
  const regime = (levels as any).regime;

  // Format swing levels for display
  const supportPrices = swingLows.length > 0 
    ? swingLows.map((s: any) => s.price).join(', ') 
    : supportLevels.join(', ') || 'None detected';
  const resistancePrices = swingHighs.length > 0 
    ? swingHighs.map((s: any) => s.price).join(', ') 
    : resistanceLevels.join(', ') || 'None detected';
  const rayHighPrices = rayHighs.length > 0 
    ? rayHighs.map((r: any) => r.price).join(', ') 
    : 'None detected';
  const rayLowPrices = rayLows.length > 0 
    ? rayLows.map((r: any) => r.price).join(', ') 
    : 'None detected';

  const prompt = `You are a trading signal analyzer. Analyze the following price action data against the trading strategy rules and generate a signal.

STRATEGY RULES:
${strategyRules}

RECENT PRICE DATA (last 20 candles):
${JSON.stringify(recentCandles, null, 2)}

CURRENT CANDLE:
- Timestamp: ${currentCandleTimestamp.toISOString()}
- Open: ${Number(currentCandle.open)}
- High: ${Number(currentCandle.high)}
- Low: ${Number(currentCandle.low)}
- Close: ${Number(currentCandle.close)}

SWING ZONE INDICATOR DATA (EXACT data as displayed on the chart):

1. SWING ZONES:
- Support Levels (Swing Lows): ${supportPrices}
- Resistance Levels (Swing Highs): ${resistancePrices}
${swingHighs.length > 0 ? `\nSwing High Details:\n${JSON.stringify(swingHighs, null, 2)}` : ''}
${swingLows.length > 0 ? `\nSwing Low Details:\n${JSON.stringify(swingLows, null, 2)}` : ''}

2. SWING RAYS:
- Ray Highs (Resistance Rays): ${rayHighPrices}
- Ray Lows (Support Rays): ${rayLowPrices}
${rayHighs.length > 0 ? `\nRay High Details:\n${JSON.stringify(rayHighs, null, 2)}` : ''}
${rayLows.length > 0 ? `\nRay Low Details:\n${JSON.stringify(rayLows, null, 2)}` : ''}

3. MARKET REGIME:
${regime ? `- Regime: ${regime.regime}\n- Recommendation: ${regime.recommendation}` : 'Not available'}

CRITICAL INSTRUCTION: All indicator data shown above (Swing Zones, Swing Rays, and Market Regime) are the EXACT values calculated by the indicator and displayed on the chart. You MUST use these exact values when analyzing price action. Do NOT calculate, estimate, or infer different levels. When referencing price proximity to support, resistance, or ray levels in your reasoning, use ONLY the values provided above.

Based on the strategy rules, price action, and the EXACT indicator data shown above, determine if the signal should be:
- BUY: If conditions favor entering a long position
- SELL: If conditions favor entering a short position
- HOLD: If conditions do not favor entering a position

${options?.concise ? `
REASONING (concise mode): Write 2-4 short sentences only. Focus on: (1) key level(s) and regime, (2) the one main reason for the signal. Spot vital information only; no filler. Use exact indicator values when referencing levels.` : ''}

Respond with a JSON object containing:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "reasoning": "${options?.concise ? "2-4 short sentences. Key levels, regime, and main reason only. Concise and vital." : "Brief explanation of why this signal was generated based on the strategy rules. When referencing support/resistance levels or rays, use ONLY the exact values provided above (e.g., 'Price is at 3.85, which is above support at 3.83' or 'Price touched resistance ray at 3.94'). Include relevant market regime information if applicable."}"
}`;

  try {
    const openai = await getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Using latest GPT-4o model which supports json_object response format
      messages: [
        {
          role: 'system',
          content: options?.concise
            ? 'You are an expert trading analyst. Generate trading signals. Keep reasoning concise: 2-4 sentences, key findings only (levels, regime, main reason). No filler. Always respond with valid JSON only.'
            : 'You are an expert trading analyst. Analyze price action and trading strategies to generate trading signals. Always respond with valid JSON only, no additional text.',
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
      signal: (response.signal || 'HOLD').toUpperCase() as SignalType,
      reasoning: response.reasoning || 'No reasoning provided',
    };
  } catch (error: any) {
    console.error('AI chart analysis error:', error);
    // Preserve original error message if available
    const errorMessage = error?.message || 'Failed to analyze chart for signal';
    const enhancedError = new Error(errorMessage);
    (enhancedError as any).originalError = error;
    throw enhancedError;
  }
}

function extractLevelsFromData(data: OHLCData[]): IndicatorLevels {
  // Simple support/resistance calculation
  const closes = data.map((d) => d.close);
  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);

  const support = Math.min(...lows);
  const resistance = Math.max(...highs);

  return {
    support: [support],
    resistance: [resistance],
  };
}
