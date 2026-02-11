/**
 * Guidelines AI uses when deciding HOLD vs EXIT during an open position.
 * Displayed on strategy detail page so users (and optimization) can reference them.
 */
export const HOLD_EXIT_GUIDELINES = [
  'Objective: Maximize profit capture. Analyze full price evolution since entry, not just the last candle.',
  'Watch indicator levels—if new levels appear or shift (Swing Zone highs/lows, regime), factor that in.',
  'When price moves in our favor toward resistance (BUY) or support (SELL): consider capturing profit before a reaction.',
  'When price moves against us: exit only when the market clearly signals it will not turn in our favor.',
  'Context used: strategy rules, Swing Zone (highs, lows, regime, recent candles), price trajectory (resistance/support distance, momentum).',
];
