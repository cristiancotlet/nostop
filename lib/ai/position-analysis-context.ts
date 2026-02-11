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
  rayHighs?: Array<{ price: number }>;
  rayLows?: Array<{ price: number }>;
  recentCandles?: Array<{ o: number; h: number; l: number; c: number }>;
}

function buildPriceTrajectory(input: PriceTrajectoryInput): string {
  const { entrySignal, currentPrice, newCandle, swingHighs, swingLows, rayHighs, rayLows } = input;
  const lines: string[] = [];

  // Direction of current candle (bullish/bearish)
  const bodySize = newCandle.close - newCandle.open;
  const candleRange = newCandle.high - newCandle.low;
  const direction = bodySize > 0 ? 'bullish' : bodySize < 0 ? 'bearish' : 'doji';
  const bodyPct = candleRange > 0 ? (Math.abs(bodySize) / candleRange * 100).toFixed(0) : '0';
  const momentumNote = direction === 'doji' ? ' — Momentum may be weakening' : '';
  lines.push(`- Current candle: ${direction} (body ${bodyPct}% of range)${momentumNote}`);

  // Combine swing zones and rays for levels (rays can act as resistance/support)
  const allResistances = [...(swingHighs || []), ...(rayHighs || [])].map((s) => s.price);
  const allSupports = [...(swingLows || []), ...(rayLows || [])].map((s) => s.price);

  const resistancesAbove = allResistances.filter((p) => p > currentPrice).sort((a, b) => a - b);
  const supportsBelow = allSupports.filter((p) => p < currentPrice).sort((a, b) => b - a);

  const nearestResAbove = resistancesAbove[0];
  const nearestSupBelow = supportsBelow[0];

  if (entrySignal === 'BUY') {
    if (nearestResAbove) {
      const dist = ((nearestResAbove - currentPrice) / currentPrice * 100).toFixed(2);
      const distPct = parseFloat(dist);
      let speedNote = '';
      if (bodySize > 0 && distPct < 0.3) speedNote = ' — Price very close to resistance';
      else if (bodySize > 0 && distPct < 0.5) speedNote = ' — Price moving up toward resistance';
      else if (bodySize > 0 && distPct < 1) speedNote = ' — Approaching resistance';
      lines.push(`- Nearest resistance above: ${nearestResAbove.toFixed(4)} (${dist}% away)${speedNote}`);
    } else {
      lines.push('- No resistance above current price');
    }
    if (nearestSupBelow) {
      const dist = ((currentPrice - nearestSupBelow) / currentPrice * 100).toFixed(2);
      lines.push(`- Nearest support below: ${nearestSupBelow.toFixed(4)} (${dist}% away)`);
    }
  } else if (entrySignal === 'SELL') {
    if (nearestSupBelow) {
      const dist = ((currentPrice - nearestSupBelow) / currentPrice * 100).toFixed(2);
      const distPct = parseFloat(dist);
      let speedNote = '';
      if (bodySize < 0 && distPct < 0.3) speedNote = ' — Price very close to support';
      else if (bodySize < 0 && distPct < 0.5) speedNote = ' — Price moving down toward support';
      else if (bodySize < 0 && distPct < 1) speedNote = ' — Approaching support';
      lines.push(`- Nearest support below: ${nearestSupBelow.toFixed(4)} (${dist}% away)${speedNote}`);
    } else {
      lines.push('- No support below current price');
    }
    if (nearestResAbove) {
      const dist = ((nearestResAbove - currentPrice) / currentPrice * 100).toFixed(2);
      lines.push(`- Nearest resistance above: ${nearestResAbove.toFixed(4)} (${dist}% away)`);
    }
  }

  return lines.join('\n');
}

function buildIndicatorContext(swingZone: {
  swingHighs: Array<{ price: number }>;
  swingLows: Array<{ price: number }>;
  rayHighs?: Array<{ price: number }>;
  rayLows?: Array<{ price: number }>;
  regime?: { regime?: string };
}, recentCandles: Array<{ ts: string; o: number; h: number; l: number; c: number }>): string {
  const parts = [
    `- Swing highs (resistance): ${swingZone.swingHighs.map((s) => s.price.toFixed(4)).join(', ') || 'none'}`,
    `- Swing lows (support): ${swingZone.swingLows.map((s) => s.price.toFixed(4)).join(', ') || 'none'}`,
    ...(swingZone.rayHighs?.length ? [`- Ray highs (additional resistance): ${swingZone.rayHighs.map((s) => s.price.toFixed(4)).join(', ')}`] : []),
    ...(swingZone.rayLows?.length ? [`- Ray lows (additional support): ${swingZone.rayLows.map((s) => s.price.toFixed(4)).join(', ')}`] : []),
    `- Regime: ${swingZone.regime?.regime || 'N/A'}`,
    `- Recent candles (last ${recentCandles.length}): price evolution from oldest to newest. Focus on latest for new signals.`,
  ];
  recentCandles.forEach((c, i) => {
    parts.push(`  [${i + 1}] O:${c.o.toFixed(4)} H:${c.h.toFixed(4)} L:${c.l.toFixed(4)} C:${c.c.toFixed(4)}`);
  });
  return parts.join('\n');
}

/** Build all context sections for AI position analysis. Enable/disable by editing this array. */
export function buildPositionAnalysisContext(params: {
  strategyRules?: string;
  swingZone?: { swingHighs: Array<{ price: number }>; swingLows: Array<{ price: number }>; rayHighs?: Array<{ price: number }>; rayLows?: Array<{ price: number }>; regime?: { regime?: string } };
  recentCandles?: Array<{ ts: string; o: number; h: number; l: number; c: number }>;
  priceTrajectory?: PriceTrajectoryInput;
  /** Full OHLC path from entry to current candle (entry + all logs + new candle) for trajectory analysis */
  priceEvolutionSinceEntry?: Array<{ ts: string; o: number; h: number; l: number; c: number }>;
}): ContextSection[] {
  const sections: ContextSection[] = [];

  // Factor 1: Strategy rules
  if (params.strategyRules?.trim()) {
    sections.push({
      label: 'STRATEGY RULES',
      content: params.strategyRules.trim(),
    });
  }

  // Factor 2: Indicator & price context (Swing Zone + Rays)
  if (params.swingZone && params.recentCandles) {
    sections.push({
      label: 'INDICATOR & PRICE CONTEXT (Swing Zone, Rays, Regime)',
      content: buildIndicatorContext(params.swingZone, params.recentCandles),
    });
  }

  // Factor 3: Full price evolution since entry (entry candle + all position logs + new candle)
  if (params.priceEvolutionSinceEntry && params.priceEvolutionSinceEntry.length > 0) {
    const evo = params.priceEvolutionSinceEntry;
    const lines = evo.map((c, i) => `Candle ${i + 1}: O:${c.o.toFixed(4)} H:${c.h.toFixed(4)} L:${c.l.toFixed(4)} C:${c.c.toFixed(4)}`);
    sections.push({
      label: 'PRICE EVOLUTION SINCE ENTRY (full path from entry to latest)',
      content: 'Use this to see the trajectory. Focus on the latest candle for new signals, but consider the full path.\n' + lines.join('\n'),
    });
  }

  // Factor 4: Where price might be heading (resistance/support, momentum)
  if (params.priceTrajectory) {
    const content = buildPriceTrajectory(params.priceTrajectory);
    if (content.trim()) {
      sections.push({
        label: 'PRICE TRAJECTORY (key levels and price direction)',
        content: 'Use this to assess where price may interact with key levels. EXIT only when the market shows actual reaction (rejection, failure, structure break)—not just proximity to a level.\n' + content,
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
