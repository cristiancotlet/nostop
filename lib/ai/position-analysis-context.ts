/**
 * Configurable context factors for AI position analysis.
 *
 * To add a new factor: add a new section in buildPositionAnalysisContext().
 * To remove a factor: comment out or delete that section.
 *
 * Current factors:
 * 1. Strategy rules
 * 2. Indicator & price context (Swing Zone: highs, lows, regime, recent candles)
 * 3. Price trajectory (where price may be heading: resistance/support distance, momentum)
 */

export interface ContextSection {
  label: string;
  content: string;
}

export interface PriceTrajectoryInput {
  entrySignal: string;
  entryPrice: number;
  currentPrice: number;
  newCandle: { open: number; high: number; low: number; close: number };
  swingHighs: Array<{ price: number }>;
  swingLows: Array<{ price: number }>;
  recentCandles?: Array<{ o: number; h: number; l: number; c: number }>;
}

function buildPriceTrajectory(input: PriceTrajectoryInput): string {
  const { entrySignal, currentPrice, newCandle, swingHighs, swingLows } = input;
  const lines: string[] = [];

  // Direction of current candle (bullish/bearish)
  const bodySize = newCandle.close - newCandle.open;
  const candleRange = newCandle.high - newCandle.low;
  const direction = bodySize > 0 ? 'bullish' : bodySize < 0 ? 'bearish' : 'doji';
  const bodyPct = candleRange > 0 ? (Math.abs(bodySize) / candleRange * 100).toFixed(0) : '0';
  lines.push(`- Current candle: ${direction} (body ${bodyPct}% of range)`);

  // For BUY: resistance above us (swing highs), support below (swing lows)
  // For SELL: support below us (swing lows), resistance above (swing highs)
  const resistancesAbove = swingHighs.filter((s) => s.price > currentPrice).sort((a, b) => a.price - b.price);
  const resistancesBelow = swingHighs.filter((s) => s.price < currentPrice).sort((a, b) => b.price - a.price);
  const supportsBelow = swingLows.filter((s) => s.price < currentPrice).sort((a, b) => b.price - a.price);
  const supportsAbove = swingLows.filter((s) => s.price > currentPrice).sort((a, b) => a.price - b.price);

  const nearestResAbove = resistancesAbove[0];
  const nearestSupBelow = supportsBelow[0];
  const nearestResBelow = resistancesBelow[0];
  const nearestSupAbove = supportsAbove[0];

  if (entrySignal === 'BUY') {
    if (nearestResAbove) {
      const dist = ((nearestResAbove.price - currentPrice) / currentPrice * 100).toFixed(2);
      const distPct = parseFloat(dist);
      let speedNote = '';
      if (bodySize > 0 && distPct < 0.5) speedNote = ' — WARNING: Price moving up rapidly toward resistance';
      else if (bodySize > 0 && distPct < 1) speedNote = ' — Approaching resistance';
      lines.push(`- Nearest resistance above: ${nearestResAbove.price.toFixed(4)} (${dist}% away)${speedNote}`);
    } else {
      lines.push('- No swing high (resistance) above current price');
    }
    if (nearestSupBelow) {
      const dist = ((currentPrice - nearestSupBelow.price) / currentPrice * 100).toFixed(2);
      lines.push(`- Nearest support below: ${nearestSupBelow.price.toFixed(4)} (${dist}% away)`);
    }
  } else if (entrySignal === 'SELL') {
    if (nearestSupBelow) {
      const dist = ((currentPrice - nearestSupBelow.price) / currentPrice * 100).toFixed(2);
      const distPct = parseFloat(dist);
      let speedNote = '';
      if (bodySize < 0 && distPct < 0.5) speedNote = ' — WARNING: Price moving down rapidly toward support';
      else if (bodySize < 0 && distPct < 1) speedNote = ' — Approaching support';
      lines.push(`- Nearest support below: ${nearestSupBelow.price.toFixed(4)} (${dist}% away)${speedNote}`);
    } else {
      lines.push('- No swing low (support) below current price');
    }
    if (nearestResAbove) {
      const dist = ((nearestResAbove.price - currentPrice) / currentPrice * 100).toFixed(2);
      lines.push(`- Nearest resistance above: ${nearestResAbove.price.toFixed(4)} (${dist}% away)`);
    }
  }

  return lines.join('\n');
}

function buildIndicatorContext(swingZone: {
  swingHighs: Array<{ price: number }>;
  swingLows: Array<{ price: number }>;
  regime?: { regime?: string };
}, recentCandles: Array<{ ts: string; o: number; h: number; l: number; c: number }>): string {
  return [
    `- Swing highs: ${swingZone.swingHighs.map((s) => s.price.toFixed(4)).join(', ') || 'none'}`,
    `- Swing lows: ${swingZone.swingLows.map((s) => s.price.toFixed(4)).join(', ') || 'none'}`,
    `- Regime: ${swingZone.regime?.regime || 'N/A'}`,
    `- Recent 8 candles for price action: ${JSON.stringify(recentCandles)}`,
  ].join('\n');
}

/** Build all context sections for AI position analysis. Enable/disable by editing this array. */
export function buildPositionAnalysisContext(params: {
  strategyRules?: string;
  swingZone?: { swingHighs: Array<{ price: number }>; swingLows: Array<{ price: number }>; regime?: { regime?: string } };
  recentCandles?: Array<{ ts: string; o: number; h: number; l: number; c: number }>;
  priceTrajectory?: PriceTrajectoryInput;
}): ContextSection[] {
  const sections: ContextSection[] = [];

  // Factor 1: Strategy rules
  if (params.strategyRules?.trim()) {
    sections.push({
      label: 'STRATEGY RULES',
      content: params.strategyRules.trim(),
    });
  }

  // Factor 2: Indicator & price context (Swing Zone)
  if (params.swingZone && params.recentCandles) {
    sections.push({
      label: 'INDICATOR & PRICE CONTEXT (Swing Zone)',
      content: buildIndicatorContext(params.swingZone, params.recentCandles),
    });
  }

  // Factor 3: Where price might be heading (resistance/support, momentum)
  if (params.priceTrajectory) {
    const content = buildPriceTrajectory(params.priceTrajectory);
    if (content.trim()) {
      sections.push({
        label: 'PRICE TRAJECTORY (where price may be heading)',
        content: 'Consider resistance/support distance and momentum. If price moves in our direction but approaches resistance/support rapidly, factor that in.\n' + content,
      });
    }
  }

  return sections;
}

/** Format context sections for the AI prompt */
export function formatContextForPrompt(sections: ContextSection[]): string {
  return sections
    .map((s) => `${s.label}:\n${s.content}`)
    .join('\n\n');
}
