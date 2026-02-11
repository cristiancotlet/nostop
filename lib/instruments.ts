/** Instrument definitions for tick size and tick value. */
export const INSTRUMENTS = {
  GC: {
    code: 'GC',
    name: 'Gold (GC) COMEX',
    tickSize: 0.1,
    tickValue: 10,
  },
  HG: {
    code: 'HG',
    name: 'Copper (HG) COMEX',
    tickSize: 0.0005,
    tickValue: 12.5,
  },
  CL: {
    code: 'CL',
    name: 'Crude Oil (CL) NYMEX',
    tickSize: 0.01,
    tickValue: 10,
  },
  NG: {
    code: 'NG',
    name: 'Natural Gas (NG) NYMEX',
    tickSize: 0.001,
    tickValue: 10,
  },
} as const;

export type InstrumentType = keyof typeof INSTRUMENTS;

export const INSTRUMENT_OPTIONS: { value: InstrumentType; label: string; name: string }[] = [
  { value: 'GC', label: 'Gold (GC) COMEX', name: 'Gold' },
  { value: 'HG', label: 'Copper (HG) COMEX', name: 'Copper' },
  { value: 'CL', label: 'Crude Oil (CL) NYMEX', name: 'Crude Oil' },
  { value: 'NG', label: 'Natural Gas (NG) NYMEX', name: 'Natural Gas' },
];

export function getTickSize(instrumentType: InstrumentType | string): number {
  const inst = INSTRUMENTS[instrumentType as InstrumentType];
  return inst?.tickSize ?? 0.01;
}

export function computeTicksPnL(
  entrySignal: string,
  entryPrice: number,
  close: number,
  instrumentType: InstrumentType | string
): number {
  const tickSize = getTickSize(instrumentType);
  const pnl = entrySignal === 'BUY' ? close - entryPrice : entryPrice - close;
  return Math.round(pnl / tickSize);
}
