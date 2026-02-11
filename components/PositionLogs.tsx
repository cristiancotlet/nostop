'use client';

import { useState, useEffect } from 'react';

interface PositionLog {
  id: string;
  candleTimestamp: string;
  conclusion: string;
  closePrice?: number | null;
  ohlcData?: { timestamp: string; close: number } | null;
}

interface Position {
  id: string;
  status: 'OPEN' | 'CLOSED';
  currentCandleCount: number;
  signal: {
    instrument: string;
    timeframe: string;
  };
}

interface PositionLogsProps {
  positionId: string;
  position: Position;
  onUpdate: () => void;
}

export default function PositionLogs({ positionId, position, onUpdate }: PositionLogsProps) {
  const [logs, setLogs] = useState<PositionLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLogs();
    // Refresh logs every 5 seconds to catch newly generated logs
    const interval = setInterval(() => {
      if (position.status === 'OPEN' && position.currentCandleCount < 10) {
        fetchLogs();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [positionId, position.status, position.currentCandleCount]);

  const fetchLogs = async () => {
    try {
      const response = await fetch(`/api/positions/${positionId}`);
      const data = await response.json();
      if (data.success && data.data.positionLogs) {
        setLogs(data.data.positionLogs);
        // Trigger parent update if logs changed
        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error('Failed to fetch position logs:', error);
    }
  };

  return (
    <div className="space-y-4">
      {position.status === 'OPEN' && position.currentCandleCount < 10 && (
        <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-semibold">Automatic Monitoring:</span> AI will automatically analyze each new candle and add a performance log. 
            Position will be monitored for up to {10 - position.currentCandleCount} more candle{10 - position.currentCandleCount !== 1 ? 's' : ''}.
          </p>
        </div>
      )}

      {position.status === 'CLOSED' && (
        <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Position is closed. No further monitoring will occur.
          </p>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {position.status === 'OPEN' 
            ? 'No position logs yet. Logs will be automatically generated when new candles are added.'
            : 'No position logs available.'}
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log, index) => (
            <div key={log.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-medium">Candle {index + 1}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {new Date(log.candleTimestamp).toLocaleString()}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  Price: {log.closePrice ?? log.ohlcData?.close ?? '—'}
                </span>
              </div>
              <p className="text-sm">{log.conclusion}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
