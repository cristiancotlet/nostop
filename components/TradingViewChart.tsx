'use client';

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { 
  calculateSwingZone, 
  addSwingZoneLines,
  calculateSwingRays,
  addSwingRays,
  SwingZoneSettings 
} from '@/lib/indicators/custom-indicator';

export interface OHLCData {
  id?: string;
  timestamp: string;
  instrument?: string;
  timeframe?: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Compute Y-axis price precision from OHLC data. */
function getPricePrecisionFromData(ohlcData: OHLCData[]): number {
  if (ohlcData.length === 0) return 2;
  let maxPrecision = 0;
  for (const d of ohlcData) {
    for (const v of [d.open, d.high, d.low, d.close]) {
      if (!isFinite(v)) continue;
      if (Math.floor(v) === v && v === Math.round(v)) continue;
      const s = v.toFixed(12);
      const m = s.match(/\.(\d+)/);
      if (m) {
        const digits = m[1].replace(/0+$/, '');
        if (digits.length > maxPrecision) maxPrecision = digits.length;
      }
    }
  }
  return maxPrecision > 0 ? maxPrecision : 2;
}

interface TradingViewChartProps {
  instrument?: string;
  timeframe?: string;
  height?: number;
  /** When provided, chart uses this data instead of fetching from API. View state still keyed by instrument+timeframe. */
  data?: OHLCData[];
}

export interface TradingViewChartRef {
  appendCandle: (candle: OHLCData) => Promise<void>;
  refreshData: () => Promise<void>;
}

const TradingViewChart = forwardRef<TradingViewChartRef, TradingViewChartProps>(({
  instrument,
  timeframe = '2h',
  height,
  data: externalData,
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indicatorLinesRef = useRef<Array<ISeriesApi<'Line'>>>([]);
  const [data, setData] = useState<OHLCData[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [regime, setRegime] = useState<{ regime: string; recommendation: string; color: string } | null>(null);
  const isInitialLoadRef = useRef(true);
  const preservedVisibleRangeRef = useRef<{ from: Time; to: Time } | null>(null);
  const preservedLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const preservedScrollPositionRef = useRef<number | null>(null);
  const isAppendingRef = useRef(false);
  const viewSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoringViewRef = useRef(false);

  // Helper function to get localStorage key for view state
  const getViewStateKey = useCallback(() => {
    if (!instrument || !timeframe) return null;
    return `chart-view-${instrument}-${timeframe}`;
  }, [instrument, timeframe]);

  // Save view state to localStorage
  const saveViewState = useCallback(() => {
    if (!chartRef.current || !instrument || !timeframe || isRestoringViewRef.current) {
      return;
    }

    const timeScale = chartRef.current.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();
    const scrollPos = timeScale.scrollPosition();
    const visibleRange = timeScale.getVisibleRange();

    if (logicalRange) {
      const viewState = {
        logicalRange: {
          from: logicalRange.from as number,
          to: logicalRange.to as number,
        },
        scrollPosition: scrollPos,
        visibleRange: visibleRange ? {
          from: visibleRange.from,
          to: visibleRange.to,
        } : null,
        timestamp: Date.now(),
      };

      const key = getViewStateKey();
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify(viewState));
        } catch (error) {
          // Ignore localStorage errors (quota exceeded, etc.)
        }
      }
    }
  }, [instrument, timeframe, getViewStateKey]);

  // Load view state from localStorage
  const loadViewState = useCallback(() => {
    if (!instrument || !timeframe) return null;

    const key = getViewStateKey();
    if (!key) return null;

    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const viewState = JSON.parse(saved);
        // Only restore if saved within last 7 days (prevent stale data)
        const age = Date.now() - (viewState.timestamp || 0);
        if (age < 7 * 24 * 60 * 60 * 1000) {
          return viewState;
        }
      }
    } catch (error) {
      // Ignore localStorage errors
    }
    return null;
  }, [instrument, timeframe, getViewStateKey]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    let handleResize: (() => void) | null = null;
    let observer: MutationObserver | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    // Wait for container to have dimensions
    const initChart = () => {
      if (!chartContainerRef.current) return;
      
      const containerWidth = chartContainerRef.current.clientWidth;
      const containerHeight = height || chartContainerRef.current.clientHeight || 600;
      
      // Don't initialize if container has no dimensions
      if (containerWidth === 0 || containerHeight === 0) {
        // Retry after a short delay
        timeoutId = setTimeout(initChart, 100);
        return;
      }

      // Detect theme and set colors (TradingView doesn't support CSS variables)
      const isDark = document.documentElement.classList.contains('dark');
      const bgColor = isDark ? '#0a0a0a' : '#ffffff';
      const textColor = isDark ? '#ededed' : '#171717';
      const gridColor = isDark ? '#262626' : '#e5e5e5';

      // Create chart
      const chart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: containerHeight,
        layout: {
          // @ts-expect-error - TradingView type definitions issue with 'solid' type
          background: { type: 'solid', color: bgColor },
          textColor: textColor,
        },
        grid: {
          vertLines: { color: gridColor },
          horzLines: { color: gridColor },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 0, // No right margin by default (user controls zoom)
        },
      });

      // Create candlestick series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;
      setChartReady(true);

      // Handle resize
      handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          const newWidth = chartContainerRef.current.clientWidth;
          const newHeight = height || chartContainerRef.current.clientHeight || 600;
          chartRef.current.applyOptions({
            width: newWidth,
            height: newHeight,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      // Listen for theme changes
      observer = new MutationObserver(() => {
        if (chartRef.current && chartContainerRef.current) {
          const isDark = document.documentElement.classList.contains('dark');
          const bgColor = isDark ? '#0a0a0a' : '#ffffff';
          const textColor = isDark ? '#ededed' : '#171717';
          const gridColor = isDark ? '#262626' : '#e5e5e5';
          
          chartRef.current.applyOptions({
            layout: {
              // @ts-expect-error - TradingView type definitions issue with 'solid' type
              background: { type: 'solid', color: bgColor },
              textColor: textColor,
            },
            grid: {
              vertLines: { color: gridColor },
              horzLines: { color: gridColor },
            },
          });
        }
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      // Save view state periodically (every 2 seconds) to capture user zoom/pan
      const saveInterval = setInterval(() => {
        if (chartRef.current && !isRestoringViewRef.current) {
          saveViewState();
        }
      }, 2000);
      
      // Store interval ID for cleanup
      (chartRef.current as any).__saveInterval = saveInterval;
    };
    
    initChart();
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (viewSaveTimeoutRef.current) {
        clearTimeout(viewSaveTimeoutRef.current);
      }
      // Save view state one last time before unmounting
      if (chartRef.current) {
        saveViewState();
        // Clear save interval
        const saveInterval = (chartRef.current as any).__saveInterval;
        if (saveInterval) {
          clearInterval(saveInterval);
        }
      }
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
      setChartReady(false);
    };
  }, [height, saveViewState]);

  const updateChart = useCallback((ohlcData: OHLCData[], preserveView: boolean = false) => {
    if (!chartRef.current || !seriesRef.current) {
      return;
    }

    // Preserve view state if requested (for appending candles)
    if (preserveView) {
      const timeScale = chartRef.current.timeScale();
      
      // Use logical range (bar indices) - most reliable method
      const logicalRange = timeScale.getVisibleLogicalRange();
      if (logicalRange) {
        preservedLogicalRangeRef.current = {
          from: logicalRange.from as number,
          to: logicalRange.to as number,
        };
      }
      
      // Also preserve scroll position (native TradingView method)
      try {
        const scrollPosition = timeScale.scrollPosition();
        preservedScrollPositionRef.current = scrollPosition;
      } catch (error) {
        // scrollPosition might not be available in all versions
      }
      
      // Backup: preserve visible range (timestamp-based)
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        preservedVisibleRangeRef.current = visibleRange;
      }
    }

    if (ohlcData.length === 0) {
      seriesRef.current.setData([]);
      return;
    }

    // Convert to candlestick format with proper timestamp handling
    const candlestickDataMap = new Map<number, CandlestickData>();
    
    ohlcData.forEach((d) => {
      // Parse timestamp - handle ISO format with timezone (e.g., "2020-10-09T08:00:00+04:00")
      const timestamp = new Date(d.timestamp);
      if (isNaN(timestamp.getTime())) {
        console.warn('Invalid timestamp:', d.timestamp);
        return;
      }
      
      // Convert to Unix timestamp (seconds) - TradingView expects seconds since epoch
      const timeValue = Math.floor(timestamp.getTime() / 1000) as Time;
      
      // Use Map to automatically handle duplicates - later entries with same timestamp will overwrite
      candlestickDataMap.set(timeValue as number, {
        time: timeValue,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      });
    });
    
    // Convert Map to array and sort by time ascending (TradingView requirement)
    const candlestickData: CandlestickData[] = Array.from(candlestickDataMap.values())
      .sort((a, b) => (a.time as number) - (b.time as number));

    // Final validation: ensure data is strictly ascending (no duplicates or out-of-order)
    const validatedData: CandlestickData[] = [];
    let prevTime: number | null = null;
    
    for (const candle of candlestickData) {
      const currTime = candle.time as number;
      if (prevTime === null || currTime > prevTime) {
        validatedData.push(candle);
        prevTime = currTime;
      } else {
        console.warn(`Removing duplicate/out-of-order entry: prevTime=${prevTime}, currTime=${currTime}`);
      }
    }

    if (validatedData.length === 0) {
      console.warn('No valid candlestick data after processing');
      return;
    }

    // Apply price format based on data precision (Y-axis decimals)
    const precision = getPricePrecisionFromData(ohlcData);
    const minMove = precision > 0 ? Math.pow(10, -precision) : 1;
    seriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });

    // Set data first
    seriesRef.current.setData(validatedData);

    // If preserving view, restore it IMMEDIATELY after setData (before indicators)
    // Use native TradingView methods in order of precision: logical range > scroll position > visible range
    if (preserveView && chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const preservedLogical = preservedLogicalRangeRef.current;
      const preservedScroll = preservedScrollPositionRef.current;
      const preservedRange = preservedVisibleRangeRef.current;
      
      // Method 1: Restore logical range (most reliable - uses bar indices)
      if (preservedLogical) {
        try {
          timeScale.setVisibleLogicalRange(preservedLogical);
        } catch (error) {
          // Ignore errors
        }
      }
      
      // Method 2: Restore scroll position (precise pixel-level control)
      if (preservedScroll !== null) {
        try {
          timeScale.scrollToPosition(preservedScroll, false); // false = don't animate
        } catch (error) {
          // Ignore if not available
        }
      }
      
      // Method 3: Restore visible range as final backup (timestamp-based)
      if (preservedRange) {
        try {
          timeScale.setVisibleRange(preservedRange);
        } catch (error) {
          // Ignore errors
        }
      }
      
      // Verify and re-restore if needed (after a micro-delay)
      requestAnimationFrame(() => {
        if (chartRef.current && preserveView) {
          const timeScale = chartRef.current.timeScale();
          
          // Check current state
          // Re-restore logical range (most reliable)
          if (preservedLogical) {
            try {
              timeScale.setVisibleLogicalRange(preservedLogical);
            } catch (error) {
              // Ignore
            }
          }
          
          // Re-restore scroll position
          if (preservedScroll !== null) {
            try {
              timeScale.scrollToPosition(preservedScroll, false);
            } catch (error) {
              // Ignore
            }
          }
        }
      });
    }

    // Calculate and add Swing Zone indicator
    // IMPORTANT: Use deduplicated validatedData, not raw ohlcData which may have duplicates
    if (validatedData.length > 20) {
      // Remove existing indicator lines
      indicatorLinesRef.current.forEach((line) => {
        chartRef.current?.removeSeries(line);
      });
      indicatorLinesRef.current = [];

      // Get current price (last close) from validated data
      const currentPrice = validatedData[validatedData.length - 1]?.close || 0;

      // Swing Zone settings (Aggressive scenario as per Pine Script)
      const swingSettings: SwingZoneSettings = {
        showHighs: true,
        showLows: true,
        sensitivity: 2, // Aggressive: 2=Aggressive, 3=Balanced, 5=Conservative
        maxSwingPoints: 2, // Aggressive: 2=Aggressive, 3=Balanced, 5=Conservative
        lineWidth: 50, // Zone width in ticks/points (as per Pine Script default)
        lineOpacity: 80, // Zone opacity (as per Pine Script default)
        showRegime: true,
        fastMALength: 21,
        slowMALength: 50,
        regimeConfirmationBars: 2,
        enableRays: true, // Enable swing rays
        raySensitivity: 2, // Aggressive: 2=Aggressive, 3=Balanced, 5=Conservative
        numRaysToShow: 3, // Aggressive: 3=Aggressive, 5=Balanced, 7=Conservative
        rayLineWidth: 2,
        rayOpacity: 50,
      };

      // Convert validatedData back to the format expected by calculateSwingZone
      // validatedData has Time type, we need to convert back to ISO string for the function
      const deduplicatedData = validatedData.map((candle) => {
        // Convert Time back to ISO string
        const timestamp = new Date((candle.time as number) * 1000).toISOString();
        return {
          high: candle.high,
          low: candle.low,
          close: candle.close,
          timestamp: timestamp,
        };
      });

      // Calculate Swing Zone using DEDUPLICATED data
      const swingZone = calculateSwingZone(
        deduplicatedData,
        swingSettings
      );

      // Update regime state for display
      if (swingZone.regime) {
        setRegime(swingZone.regime);
      }

      // Add Swing Zone lines to chart
      if (seriesRef.current && chartRef.current) {
        const zoneLines = addSwingZoneLines(
          chartRef.current,
          swingZone.swingHighs,
          swingZone.swingLows,
          currentPrice,
          swingSettings
        );
        
        // Calculate and add Swing Rays using DEDUPLICATED data
        const swingRays = calculateSwingRays(
          deduplicatedData,
          swingSettings
        );
        
        const rayLines = addSwingRays(
          chartRef.current,
          swingRays.rayHighs,
          swingRays.rayLows,
          swingSettings
        );
        
        // Combine all indicator lines
        indicatorLinesRef.current = [...zoneLines, ...rayLines];
      }
    }

    // Only fit content on initial load if no saved view state exists
    if (isInitialLoadRef.current) {
      const savedViewState = loadViewState();
      if (savedViewState) {
        // Restore saved view state
        isRestoringViewRef.current = true;
        const timeScale = chartRef.current.timeScale();
        
        // Restore logical range (most reliable)
        if (savedViewState.logicalRange) {
          preservedLogicalRangeRef.current = savedViewState.logicalRange;
          try {
            timeScale.setVisibleLogicalRange(savedViewState.logicalRange);
          } catch (error) {
            // Ignore errors
          }
        }
        
        // Restore scroll position
        if (savedViewState.scrollPosition !== null && savedViewState.scrollPosition !== undefined) {
          preservedScrollPositionRef.current = savedViewState.scrollPosition;
          try {
            timeScale.scrollToPosition(savedViewState.scrollPosition, false);
          } catch (error) {
            // Ignore errors
          }
        }
        
        // Restore visible range as backup
        if (savedViewState.visibleRange) {
          preservedVisibleRangeRef.current = savedViewState.visibleRange as { from: Time; to: Time };
          try {
            timeScale.setVisibleRange(savedViewState.visibleRange);
          } catch (error) {
            // Ignore errors
          }
        }
        
        // Verify and re-restore after a delay
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (chartRef.current && savedViewState.logicalRange) {
              const timeScale = chartRef.current.timeScale();
              try {
                timeScale.setVisibleLogicalRange(savedViewState.logicalRange);
                // Save the restored view to update timestamp
                setTimeout(() => {
                  saveViewState();
                  isRestoringViewRef.current = false;
                }, 200);
              } catch (error) {
                isRestoringViewRef.current = false;
              }
            } else {
              isRestoringViewRef.current = false;
            }
          }, 100);
        });
      } else {
        // No saved view, fit content to show all data
        chartRef.current.timeScale().fitContent();
        // Save the initial fitContent view
        setTimeout(() => saveViewState(), 500);
      }
      isInitialLoadRef.current = false;
    } else if (preserveView) {
      // Final restore attempt after indicators are calculated
      // This ensures the view is restored even if the immediate restore didn't work
      const restoreView = (attempt: number = 0) => {
        if (!chartRef.current) return;
        
        const timeScale = chartRef.current.timeScale();
        const preservedLogical = preservedLogicalRangeRef.current;
        const preservedScroll = preservedScrollPositionRef.current;
        const preservedRange = preservedVisibleRangeRef.current;
        
        const delay = attempt === 0 ? 50 : attempt === 1 ? 150 : 300;
        setTimeout(() => {
          if (chartRef.current) {
            try {
              // Restore logical range first (most reliable)
              if (preservedLogical) {
                try {
                  timeScale.setVisibleLogicalRange(preservedLogical);
                } catch (error) {
                  // Ignore
                }
              }
              
              // Restore scroll position
              if (preservedScroll !== null) {
                try {
                  timeScale.scrollToPosition(preservedScroll, false);
                } catch (error) {
                  // Ignore
                }
              }
              
              // Restore visible range as final backup
              if (preservedRange) {
                try {
                  timeScale.setVisibleRange(preservedRange);
                } catch (error) {
                  // Ignore
                }
              }
              
              // Clear preserved values after successful restore
              if (attempt >= 1) {
                preservedLogicalRangeRef.current = null;
                preservedVisibleRangeRef.current = null;
                preservedScrollPositionRef.current = null;
                // Save the restored view state to localStorage
                setTimeout(() => saveViewState(), 100);
              }
            } catch (error) {
              // Retry if it fails (max 3 attempts)
              if (attempt < 2) {
                restoreView(attempt + 1);
              } else {
                console.warn('Failed to restore view after multiple attempts');
                preservedLogicalRangeRef.current = null;
                preservedVisibleRangeRef.current = null;
                preservedScrollPositionRef.current = null;
              }
            }
          }
        }, delay);
      };
      
      restoreView();
    }
  }, [loadViewState, saveViewState]);

  // Method to refresh all data
  const refreshData = useCallback(async () => {
    if (!instrument) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        instrument,
        timeframe,
        limit: '50000',
      });
      const response = await fetch(`/api/ohlc?${params}`);
      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setLoading(false);
    }
  }, [instrument, timeframe]);

  // Method to append a single candle without resetting the view
  const appendCandle = useCallback(async (candle: OHLCData) => {
    if (!chartRef.current || !seriesRef.current || !instrument) {
      return;
    }

    // Convert new candle to candlestick format
    const timestamp = new Date(candle.timestamp);
    if (isNaN(timestamp.getTime())) {
      console.warn('Invalid timestamp:', candle.timestamp);
      return;
    }

    const timeValue = Math.floor(timestamp.getTime() / 1000);
    const candlestickData: CandlestickData = {
      time: timeValue as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    };

    // Preserve view state BEFORE any operations
    const timeScale = chartRef.current.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();
    const scrollPos = timeScale.scrollPosition();
    const visibleRange = timeScale.getVisibleRange();

    // Try to use update() method first (doesn't reset view)
    // Check if new candle is newer than the last one
    let canUseUpdate = false;
    if (data.length > 0) {
      const lastCandle = data[data.length - 1];
      const lastTimestamp = new Date(lastCandle.timestamp);
      const lastTimeValue = Math.floor(lastTimestamp.getTime() / 1000);
      canUseUpdate = timeValue > lastTimeValue;
    }

    if (canUseUpdate) {
      // Use update() method - this doesn't reset the view
      try {
        // Restore view IMMEDIATELY after update() - TradingView shifts logical range by +1 when adding a candle
        // We need to restore the original range to keep the same bars visible
        
        seriesRef.current.update(candlestickData);
        
        // Immediately restore logical range (before TradingView can shift it)
        if (logicalRange && chartRef.current) {
          const timeScale = chartRef.current.timeScale();
          // Restore immediately - this prevents the +1 shift
          timeScale.setVisibleLogicalRange({
            from: logicalRange.from as number,
            to: logicalRange.to as number,
          });
        }
        
        // Update state
        setData(prev => [...prev, candle]);
        
        // Verify and re-restore view multiple times (TradingView may shift it asynchronously)
        const restoreView = (attempt: number = 0) => {
          if (!chartRef.current || attempt >= 3) return;
          
          requestAnimationFrame(() => {
            if (!chartRef.current) return;
            
            const timeScale = chartRef.current.timeScale();
            const currentLogical = timeScale.getVisibleLogicalRange();
            const currentScroll = timeScale.scrollPosition();
            
            // Restore logical range if it shifted
            if (logicalRange && currentLogical) {
              const fromDiff = Math.abs((currentLogical.from as number) - (logicalRange.from as number));
              const toDiff = Math.abs((currentLogical.to as number) - (logicalRange.to as number));
              
              if (fromDiff > 0.1 || toDiff > 0.1) {
                timeScale.setVisibleLogicalRange({
                  from: logicalRange.from as number,
                  to: logicalRange.to as number,
                });
                
                // Retry after a delay
                setTimeout(() => restoreView(attempt + 1), 50 * (attempt + 1));
              } else {
                // View is correct, save it to localStorage
                setTimeout(() => saveViewState(), 100);
              }
            }
            
            // Restore scroll position
            if (scrollPos !== null) {
              const scrollDiff = Math.abs(currentScroll - scrollPos);
              if (scrollDiff > 0.1) {
                timeScale.scrollToPosition(scrollPos, false);
                setTimeout(() => saveViewState(), 100);
              }
            }
          });
        };
        
        // Start restoration attempts
        restoreView();
        
        return; // Successfully used update(), no need to refresh all data
      } catch (error) {
        // Fall through to refresh all data
      }
    }

    // Fallback: Refresh all data but preserve view
    // Set flag to prevent useEffect from calling updateChart
    isAppendingRef.current = true;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        instrument,
        timeframe,
        limit: '50000',
      });
      const response = await fetch(`/api/ohlc?${params}`);
      const result = await response.json();
      if (result.success && result.data) {
        const newData = result.data;
        
        // Store preserved values in refs for updateChart to use
        if (logicalRange) {
          preservedLogicalRangeRef.current = {
            from: logicalRange.from as number,
            to: logicalRange.to as number,
          };
        }
        if (scrollPos !== null) {
          preservedScrollPositionRef.current = scrollPos;
        }
        if (visibleRange) {
          preservedVisibleRangeRef.current = visibleRange;
        }
        
        // Manually call updateChart with preserveView flag
        updateChart(newData, true);
        
        // Update state (this will trigger useEffect, but isAppendingRef prevents double update)
        setData(newData);
      }
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setLoading(false);
      // Reset flag after a short delay to allow updateChart to complete
      setTimeout(() => {
        isAppendingRef.current = false;
      }, 100);
    }
  }, [instrument, timeframe, updateChart, data]);

  // Expose methods via ref (no-op when external data prop is used, e.g. backtest page)
  useImperativeHandle(ref, () => ({
    appendCandle: externalData !== undefined ? async () => {} : appendCandle,
    refreshData: externalData !== undefined ? async () => {} : refreshData,
  }), [appendCandle, refreshData, externalData]);

  // Apply data to chart once it's ready (use external data prop when provided, else fetched data)
  const sourceData = externalData !== undefined ? externalData : data;
  useEffect(() => {
    // Skip if we're appending (updateChart was called manually)
    if (isAppendingRef.current) {
      return;
    }
    
    if (chartReady && sourceData.length > 0 && chartRef.current && seriesRef.current) {
      updateChart(sourceData, false);
    }
  }, [chartReady, sourceData, updateChart]);

  // Fetch from API only when no external data prop is provided
  useEffect(() => {
    if (externalData !== undefined) return;
    if (!instrument) return;

    const fetchData = async () => {
      // Reset initial load flag when instrument/timeframe changes
      isInitialLoadRef.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          instrument,
          timeframe,
          limit: '50000', // Increased limit to handle large datasets (CSV has ~9,942 records)
        });

        const response = await fetch(`/api/ohlc?${params}`);
        const result = await response.json();

        if (result.success && result.data) {
          console.log(`Fetched ${result.data.length} records for ${instrument}/${timeframe}`);
          setData(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch OHLC data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [instrument, timeframe, externalData]);

  return (
    <div className="h-full flex flex-col relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded">
          <p className="text-sm text-muted-foreground">Loading chart data...</p>
        </div>
      )}
      {regime && (
        <div 
          className="absolute top-2 right-2 z-20 px-3 py-1.5 rounded text-xs font-medium text-white shadow-lg"
          style={{ backgroundColor: regime.color }}
        >
          <div className="font-semibold">{regime.regime}</div>
          <div className="text-xs opacity-90">{regime.recommendation}</div>
        </div>
      )}
      <div 
        ref={chartContainerRef} 
        className="flex-1 w-full border rounded bg-background" 
        style={{ height: '100%', minHeight: '400px' }}
      />
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';

export default TradingViewChart;
