// Default calcParams per indicator (extracted from klinecharts' own built-in defaults, plus
// the two custom ones) and, for the common ones, friendlier per-slot labels than "Param N"
// for the settings popover. An indicator with no entry here has no adjustable params.
export const DEFAULT_CALC_PARAMS: Record<string, number[] | undefined> = {
  MA: [5, 10, 30, 60],
  EMA: [6, 12, 20],
  SMA: [12, 2],
  BBI: [3, 6, 12, 24],
  BOLL: [20, 2],
  SAR: [2, 2, 20],
  MACD: [12, 26, 9],
  RSI: [6, 12, 24],
  KDJ: [9, 3, 3],
  CCI: [20],
  WR: [6, 10, 14],
  BIAS: [6, 12, 24],
  BRAR: [26],
  CR: [26, 10, 20, 40, 60],
  DMA: [10, 50, 10],
  DMI: [14, 6],
  EMV: [14, 9],
  MTM: [12, 6],
  OBV: [30],
  PSY: [12, 6],
  PVT: undefined,
  ROC: [12, 6],
  TRIX: [12, 9],
  VR: [26, 6],
  AO: [5, 34],
  AVP: undefined,
  VOL: [5, 10, 20],
  AROON: [14],
  AD: undefined,
}

/** Friendlier slot labels for the most commonly-tuned indicators; everything else falls back to "Param N". */
export const PARAM_LABELS: Record<string, string[]> = {
  MA: ['Period 1', 'Period 2', 'Period 3', 'Period 4'],
  EMA: ['Period 1', 'Period 2', 'Period 3'],
  SMA: ['Period', 'Weight'],
  BOLL: ['Period', 'Std. dev.'],
  SAR: ['Start', 'Step', 'Max'],
  MACD: ['Fast', 'Slow', 'Signal'],
  RSI: ['Period 1', 'Period 2', 'Period 3'],
  KDJ: ['Period', '%K smoothing', '%D smoothing'],
  CCI: ['Period'],
  WR: ['Period 1', 'Period 2', 'Period 3'],
  AROON: ['Period'],
}

export function paramLabel(name: string, index: number): string {
  return PARAM_LABELS[name]?.[index] ?? `Param ${index + 1}`
}
