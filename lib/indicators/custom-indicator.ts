import { IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts';

export interface IndicatorLevels {
  support: number[];
  resistance: number[];
}

/**
 * Calculate support and resistance levels from OHLC data
 */
export function calculateSupportResistance(
  data: Array<{ high: number; low: number; close: number }>,
  lookback: number = 20
): IndicatorLevels {
  const support: number[] = [];
  const resistance: number[] = [];

  for (let i = lookback; i < data.length; i++) {
    const window = data.slice(i - lookback, i);
    const lows = window.map((d) => d.low);
    const highs = window.map((d) => d.high);

    // Simple support/resistance: local minima and maxima
    const localLow = Math.min(...lows);
    const localHigh = Math.max(...highs);

    // Only add if significant (e.g., at least 1% difference)
    const currentPrice = data[i].close;
    if (localLow < currentPrice * 0.99) {
      support.push(localLow);
    }
    if (localHigh > currentPrice * 1.01) {
      resistance.push(localHigh);
    }
  }

  // Remove duplicates and sort
  const uniqueSupport = Array.from(new Set(support)).sort((a, b) => b - a);
  const uniqueResistance = Array.from(new Set(resistance)).sort((a, b) => a - b);

  return {
    support: uniqueSupport.slice(0, 3), // Top 3 support levels
    resistance: uniqueResistance.slice(0, 3), // Top 3 resistance levels
  };
}

/**
 * Add support and resistance lines to chart
 */
export function addSupportResistanceLines(
  chart: IChartApi,
  levels: IndicatorLevels,
  series: ISeriesApi<'Candlestick' | 'Line' | 'Area' | 'Histogram' | 'Baseline'>
): Array<ISeriesApi<'Line'>> {
  const lines: Array<ISeriesApi<'Line'>> = [];

  // Add support lines (green)
  levels.support.forEach((level, index) => {
    const supportSeries = chart.addLineSeries({
      color: '#00ff00',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: `Support ${index + 1}`,
    });

    const data: LineData[] = [];
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    if (visibleRange) {
      // Add line data points
      data.push({ time: visibleRange.from as Time, value: level });
      data.push({ time: visibleRange.to as Time, value: level });
    }

    supportSeries.setData(data);
    lines.push(supportSeries);
  });

  // Add resistance lines (red)
  levels.resistance.forEach((level, index) => {
    const resistanceSeries = chart.addLineSeries({
      color: '#ff0000',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: `Resistance ${index + 1}`,
    });

    const data: LineData[] = [];
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    if (visibleRange) {
      data.push({ time: visibleRange.from as Time, value: level });
      data.push({ time: visibleRange.to as Time, value: level });
    }

    resistanceSeries.setData(data);
    lines.push(resistanceSeries);
  });

  return lines;
}

// ========= SWING ZONE INDICATOR (Converted from Pine Script v6) =========

export interface SwingZoneSettings {
  showHighs?: boolean;
  showLows?: boolean;
  sensitivity?: number; // 2=Aggressive, 3=Balanced, 5=Conservative
  maxSwingPoints?: number;
  lineWidth?: number; // Line width in pixels
  lineOpacity?: number; // 0-100 (0 = opaque, 100 = transparent)
  showRegime?: boolean;
  fastMALength?: number;
  slowMALength?: number;
  regimeConfirmationBars?: number;
  enableRays?: boolean;
  raySensitivity?: number; // Ray detection sensitivity (2=Aggressive, 3=Balanced, 5=Conservative)
  numRaysToShow?: number; // Number of rays to display (3=Aggressive, 5=Balanced, 7=Conservative)
  rayLineWidth?: number; // Ray line width
  rayOpacity?: number; // Ray opacity (0-100)
}

export interface SwingPoint {
  barIndex: number;
  price: number;
  type: 'high' | 'low';
  time: Time;
}

export interface MarketRegime {
  regime: 'Bull Trend' | 'Bear Trend' | 'Range';
  recommendation: string;
  color: string;
}

/**
 * Calculate Simple Moving Average (SMA) - equivalent to Pine Script ta.sma()
 */
function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  return sma;
}

/**
 * Detect pivot high (equivalent to Pine Script ta.pivothigh())
 * A pivot high is a high that is higher than N bars on both left and right sides
 */
function pivotHigh(
  highs: number[],
  leftBars: number,
  rightBars: number,
  index: number
): number {
  if (index < leftBars || index >= highs.length - rightBars) {
    return NaN;
  }

  const centerHigh = highs[index];
  
  // Check left side - all must be lower
  for (let i = index - leftBars; i < index; i++) {
    if (highs[i] >= centerHigh) {
      return NaN;
    }
  }
  
  // Check right side - all must be lower
  for (let i = index + 1; i <= index + rightBars; i++) {
    if (highs[i] >= centerHigh) {
      return NaN;
    }
  }
  
  return centerHigh;
}

/**
 * Detect pivot low (equivalent to Pine Script ta.pivotlow())
 * A pivot low is a low that is lower than N bars on both left and right sides
 */
function pivotLow(
  lows: number[],
  leftBars: number,
  rightBars: number,
  index: number
): number {
  if (index < leftBars || index >= lows.length - rightBars) {
    return NaN;
  }

  const centerLow = lows[index];
  
  // Check left side - all must be higher
  for (let i = index - leftBars; i < index; i++) {
    if (lows[i] <= centerLow) {
      return NaN;
    }
  }
  
  // Check right side - all must be higher
  for (let i = index + 1; i <= index + rightBars; i++) {
    if (lows[i] <= centerLow) {
      return NaN;
    }
  }
  
  return centerLow;
}

/**
 * Calculate Swing Zone indicator - detects swing highs and lows
 * This is a TypeScript conversion of the Pine Script Swing Zone v3 indicator
 */
export function calculateSwingZone(
  ohlcData: Array<{ high: number; low: number; close: number; timestamp: string }>,
  settings: SwingZoneSettings = {}
): {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  regime?: MarketRegime;
} {
  const {
    sensitivity = 2, // Aggressive default (2=Aggressive, 3=Balanced, 5=Conservative)
    showHighs = true,
    showLows = true,
    showRegime = true,
    fastMALength = 21,
    slowMALength = 50,
    regimeConfirmationBars = 2,
  } = settings;

  const highs = ohlcData.map(d => d.high);
  const lows = ohlcData.map(d => d.low);
  const closes = ohlcData.map(d => d.close);
  const timestamps = ohlcData.map(d => {
    const ts = new Date(d.timestamp);
    return Math.floor(ts.getTime() / 1000) as Time;
  });

  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  const detectedHighIndices = new Set<number>();
  const detectedLowIndices = new Set<number>();

  // Detect swing points (equivalent to Pine Script pivot detection)
  // Pine Script's ta.pivothigh(high, sensitivity, sensitivity) returns a value at bar_index
  // when the pivot at bar_index - sensitivity is confirmed (has enough bars on right)
  // We iterate through all bars and check if pivots can be confirmed
  // Start from sensitivity * 2 to ensure we have enough bars on both sides
  // End at length - sensitivity to ensure we have enough bars on the right to confirm
  // IMPORTANT: Pine Script's ta.pivothigh returns a value at bar_index when the pivot at bar_index - rightBars is confirmed
  // So we need to check if bar (i - sensitivity) is a pivot when we're at bar i
  for (let i = sensitivity * 2; i < ohlcData.length - sensitivity; i++) {
    // The pivot we're checking is at index i - sensitivity
    // At bar i, we can confirm if the pivot at i - sensitivity is valid
    const pivotBarIndex = i - sensitivity;
    
    if (showHighs && !detectedHighIndices.has(pivotBarIndex)) {
      const pivotHighValue = pivotHigh(highs, sensitivity, sensitivity, pivotBarIndex);
      if (!isNaN(pivotHighValue)) {
        detectedHighIndices.add(pivotBarIndex);
        swingHighs.push({
          barIndex: pivotBarIndex,
          price: pivotHighValue,
          type: 'high',
          time: timestamps[pivotBarIndex],
        });
      }
    }

    // Check for pivot low
    if (showLows && !detectedLowIndices.has(pivotBarIndex)) {
      const pivotLowValue = pivotLow(lows, sensitivity, sensitivity, pivotBarIndex);
      if (!isNaN(pivotLowValue)) {
        detectedLowIndices.add(pivotBarIndex);
        swingLows.push({
          barIndex: pivotBarIndex,
          price: pivotLowValue,
          type: 'low',
          time: timestamps[pivotBarIndex],
        });
      }
    }
  }

  // Limit to max swing points (keep most recent)
  const maxSwingPoints = settings.maxSwingPoints || 2; // Aggressive default (2=Aggressive, 3=Balanced, 5=Conservative)
  const limitedHighs = swingHighs.slice(-maxSwingPoints);
  const limitedLows = swingLows.slice(-maxSwingPoints);

  // Calculate market regime if enabled
  let regime: MarketRegime | undefined;
  if (showRegime && closes.length >= slowMALength) {
    const fastMA = calculateSMA(closes, fastMALength);
    const slowMA = calculateSMA(closes, slowMALength);

    const currentIndex = closes.length - 1;
    const prevIndex = currentIndex - 1;

    if (!isNaN(fastMA[currentIndex]) && !isNaN(slowMA[currentIndex]) && prevIndex >= 0) {
      const fastMARising = fastMA[currentIndex] > fastMA[prevIndex];
      const slowMARising = slowMA[currentIndex] > slowMA[prevIndex];
      const fastMAFalling = fastMA[currentIndex] < fastMA[prevIndex];
      const slowMAFalling = slowMA[currentIndex] < slowMA[prevIndex];

      let detectedRegime: 'Bull Trend' | 'Bear Trend' | 'Range' = 'Range';

      // Bullish: Fast MA > Slow MA, both rising, price above Fast MA
      if (
        fastMA[currentIndex] > slowMA[currentIndex] &&
        fastMARising &&
        slowMARising &&
        closes[currentIndex] > fastMA[currentIndex]
      ) {
        detectedRegime = 'Bull Trend';
      }
      // Bearish: Fast MA < Slow MA, both falling, price below Fast MA
      else if (
        fastMA[currentIndex] < slowMA[currentIndex] &&
        fastMAFalling &&
        slowMAFalling &&
        closes[currentIndex] < fastMA[currentIndex]
      ) {
        detectedRegime = 'Bear Trend';
      }

      let recommendation = '';
      let color = '#808080'; // Gray for Range

      if (detectedRegime === 'Bull Trend') {
        color = '#00ff00'; // Green
        recommendation = 'Trade: Long Break + Retest';
      } else if (detectedRegime === 'Bear Trend') {
        color = '#ff0000'; // Red
        recommendation = 'Trade: Short Break + Retest';
      } else {
        recommendation = 'Trade: Rejection (Fade)';
      }

      regime = {
        regime: detectedRegime,
        recommendation,
        color,
      };
    }
  }

  return {
    swingHighs: limitedHighs,
    swingLows: limitedLows,
    regime,
  };
}

/**
 * Add Swing Zone lines to chart
 * Lines extend to the right and change color based on current price position
 */
export function addSwingZoneLines(
  chart: IChartApi,
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  currentPrice: number,
  settings: SwingZoneSettings = {}
): Array<ISeriesApi<'Line'>> {
  const {
    lineWidth = 50, // Zone width in pixels (as per Pine Script default)
    lineOpacity = 80, // Zone opacity (as per Pine Script default)
  } = settings;

  const lines: Array<ISeriesApi<'Line'>> = [];
  const timeScale = chart.timeScale();
  let visibleRange = timeScale.getVisibleRange();
  
  // If no visible range, try to get it from the timeScale or use a default
  // This can happen if chart hasn't initialized yet - use data range instead
  if (!visibleRange && swingHighs.length > 0) {
    // Use the last swing point's time + some future time
    const lastTime = Math.max(
      ...swingHighs.map(s => s.time as number),
      ...swingLows.map(s => s.time as number)
    );
    visibleRange = {
      from: (Math.min(...swingHighs.map(s => s.time as number), ...swingLows.map(s => s.time as number)) - 86400) as Time, // 1 day before first swing
      to: (lastTime + 86400 * 30) as Time, // 30 days after last swing
    };
  }
  
  if (!visibleRange) {
    return lines;
  }

  // Helper to get color based on price position (green if price >= swing, red if below)
  const getColor = (swingPrice: number): string => {
    const opacity = Math.round(255 * (1 - lineOpacity / 100));
    const hexOpacity = opacity.toString(16).padStart(2, '0');
    
    if (currentPrice >= swingPrice) {
      return `#00ff00${hexOpacity}`; // Green
    } else {
      return `#ff0000${hexOpacity}`; // Red
    }
  };

  // Add swing high lines
  swingHighs.forEach((swing) => {
    try {
      const lineSeries = chart.addLineSeries({
        color: getColor(swing.price),
        lineWidth: lineWidth as any, // TradingView type definition issue
        lineStyle: 0, // Solid
        title: `Swing High ${swing.price.toFixed(2)}`,
      });

      // Ensure data is sorted ascending (TradingView requirement)
      const startTime = swing.time as number;
      const endTime = visibleRange.to as number;
      const lineData: LineData[] = startTime <= endTime
        ? [
            { time: swing.time, value: swing.price },
            { time: visibleRange.to as Time, value: swing.price }, // Extend to right
          ]
        : [
            { time: visibleRange.to as Time, value: swing.price },
            { time: swing.time, value: swing.price },
          ];

      lineSeries.setData(lineData);
      lines.push(lineSeries);
    } catch (error) {
      // Silently handle errors
    }
  });

  // Add swing low lines
  swingLows.forEach((swing) => {
    try {
      const lineSeries = chart.addLineSeries({
        color: getColor(swing.price),
        lineWidth: lineWidth as any, // TradingView type definition issue
        lineStyle: 0, // Solid
        title: `Swing Low ${swing.price.toFixed(2)}`,
      });

      // Ensure data is sorted ascending (TradingView requirement)
      const startTime = swing.time as number;
      const endTime = visibleRange.to as number;
      const lineData: LineData[] = startTime <= endTime
        ? [
            { time: swing.time, value: swing.price },
            { time: visibleRange.to as Time, value: swing.price }, // Extend to right
          ]
        : [
            { time: visibleRange.to as Time, value: swing.price },
            { time: swing.time, value: swing.price },
          ];

      lineSeries.setData(lineData);
      lines.push(lineSeries);
    } catch (error) {
      // Silently handle errors
    }
  });

  return lines;
}

/**
 * Calculate Swing Rays - separate from zones, uses close price of swing candle
 * This is a TypeScript conversion of the Pine Script Swing Rays feature
 */
export function calculateSwingRays(
  ohlcData: Array<{ high: number; low: number; close: number; timestamp: string }>,
  settings: SwingZoneSettings = {}
): {
  rayHighs: SwingPoint[];
  rayLows: SwingPoint[];
} {
  const {
    enableRays = false,
    raySensitivity = 2, // Aggressive default (2=Aggressive, 3=Balanced, 5=Conservative)
    numRaysToShow = 3, // Aggressive default (3=Aggressive, 5=Balanced, 7=Conservative)
  } = settings;

  if (!enableRays) {
    return { rayHighs: [], rayLows: [] };
  }

  const highs = ohlcData.map(d => d.high);
  const lows = ohlcData.map(d => d.low);
  const closes = ohlcData.map(d => d.close);
  const timestamps = ohlcData.map(d => {
    const ts = new Date(d.timestamp);
    return Math.floor(ts.getTime() / 1000) as Time;
  });

  const rayHighs: SwingPoint[] = [];
  const rayLows: SwingPoint[] = [];
  const detectedRayHighIndices = new Set<number>();
  const detectedRayLowIndices = new Set<number>();

  // Detect swing rays using ray-specific sensitivity
  // Rays use the close price of the swing candle, not the high/low
  // Pine Script's ta.pivothigh only returns a value once per pivot (when first detected)
  for (let i = raySensitivity * 2; i < ohlcData.length - raySensitivity; i++) {
    // Check for pivot high at bar_index - raySensitivity
    const pivotBarIndex = i - raySensitivity;
    // Only check if we haven't already detected this pivot
    if (!detectedRayHighIndices.has(pivotBarIndex)) {
      const pivotHighValue = pivotHigh(highs, raySensitivity, raySensitivity, pivotBarIndex);
      if (!isNaN(pivotHighValue)) {
        detectedRayHighIndices.add(pivotBarIndex);
        // Use close price of the swing candle (close[raySensitivity] in Pine Script)
        const swingClose = closes[pivotBarIndex];
        rayHighs.push({
          barIndex: pivotBarIndex,
          price: swingClose, // Use close, not high
          type: 'high',
          time: timestamps[pivotBarIndex],
        });
      }
    }

    // Check for pivot low
    if (!detectedRayLowIndices.has(pivotBarIndex)) {
      const pivotLowValue = pivotLow(lows, raySensitivity, raySensitivity, pivotBarIndex);
      if (!isNaN(pivotLowValue)) {
        detectedRayLowIndices.add(pivotBarIndex);
        // Use close price of the swing candle
        const swingClose = closes[pivotBarIndex];
        rayLows.push({
          barIndex: pivotBarIndex,
          price: swingClose, // Use close, not low
          type: 'low',
          time: timestamps[pivotBarIndex],
        });
      }
    }
  }

  // Keep only the latest N rays (most recent)
  const limitedHighs = rayHighs.slice(-numRaysToShow);
  const limitedLows = rayLows.slice(-numRaysToShow);

  return {
    rayHighs: limitedHighs,
    rayLows: limitedLows,
  };
}

/**
 * Add Swing Rays to chart
 * Rays use fixed colors: red for highs, green for lows
 */
export function addSwingRays(
  chart: IChartApi,
  rayHighs: SwingPoint[],
  rayLows: SwingPoint[],
  settings: SwingZoneSettings = {}
): Array<ISeriesApi<'Line'>> {
  const {
    enableRays = false,
    rayLineWidth = 2,
    rayOpacity = 50,
  } = settings;

  if (!enableRays) {
    return [];
  }

  const lines: Array<ISeriesApi<'Line'>> = [];
  const timeScale = chart.timeScale();
  let visibleRange = timeScale.getVisibleRange();
  
  // If no visible range, try to get it from the timeScale or use a default
  if (!visibleRange && (rayHighs.length > 0 || rayLows.length > 0)) {
    // Use the last ray point's time + some future time
    const allTimes = [...rayHighs.map(s => s.time as number), ...rayLows.map(s => s.time as number)];
    if (allTimes.length > 0) {
      const lastTime = Math.max(...allTimes);
      visibleRange = {
        from: (Math.min(...allTimes) - 86400) as Time, // 1 day before first ray
        to: (lastTime + 86400 * 30) as Time, // 30 days after last ray
      };
    }
  }
  
  if (!visibleRange) {
    return lines;
  }

  // Calculate color with opacity
  const opacity = Math.round(255 * (1 - rayOpacity / 100));
  const hexOpacity = opacity.toString(16).padStart(2, '0');
  const rayColorHigh = `#ff0000${hexOpacity}`; // Red for highs
  const rayColorLow = `#00ff00${hexOpacity}`; // Green for lows

  // Add swing high rays (red)
  rayHighs.forEach((ray) => {
    const lineSeries = chart.addLineSeries({
      color: rayColorHigh,
      lineWidth: rayLineWidth as any, // TradingView type definition issue
      lineStyle: 0, // Solid
      title: `Ray High ${ray.price.toFixed(2)}`,
    });

    // Ensure data is sorted ascending (TradingView requirement)
    const startTime = ray.time as number;
    const endTime = visibleRange.to as number;
    const lineData: LineData[] = startTime <= endTime
      ? [
          { time: ray.time, value: ray.price },
          { time: visibleRange.to as Time, value: ray.price }, // Extend to right
        ]
      : [
          { time: visibleRange.to as Time, value: ray.price },
          { time: ray.time, value: ray.price },
        ];

    lineSeries.setData(lineData);
    lines.push(lineSeries);
  });

  // Add swing low rays (green)
  rayLows.forEach((ray) => {
    const lineSeries = chart.addLineSeries({
      color: rayColorLow,
      lineWidth: rayLineWidth as any, // TradingView type definition issue
      lineStyle: 0, // Solid
      title: `Ray Low ${ray.price.toFixed(2)}`,
    });

    // Ensure data is sorted ascending (TradingView requirement)
    const startTime = ray.time as number;
    const endTime = visibleRange.to as number;
    const lineData: LineData[] = startTime <= endTime
      ? [
          { time: ray.time, value: ray.price },
          { time: visibleRange.to as Time, value: ray.price }, // Extend to right
        ]
      : [
          { time: visibleRange.to as Time, value: ray.price },
          { time: ray.time, value: ray.price },
        ];

    lineSeries.setData(lineData);
    lines.push(lineSeries);
  });

  return lines;
}
