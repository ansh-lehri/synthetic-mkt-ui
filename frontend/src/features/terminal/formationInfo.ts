// One-line hover descriptions for every drawing tool and indicator offered in the Chart
// tab. Indicator copy is adapted from the reference charting project's
// formationDescriptions.js; tool copy (lines/shapes/patterns) is new, written to match
// that same one-sentence style. Only entries with an actual drawable/addable
// counterpart here are included — the reference's candlestick/harmonic *detection*-only
// entries (Doji, Hammer, Gartley, Bat, Butterfly, Crab, Shark, Cypher) are dropped; see
// the chart redesign plan notes for why.
import type { DrawTool } from './PriceChart'

export const TOOL_INFO: Record<DrawTool, string> = {
  trend: 'Click twice to draw a straight trend line between two points.',
  ray: 'Click twice: a line through both points that extends forever to the right.',
  horizontal: 'Click once to place a horizontal line at that price.',
  horizontalRay: 'Click once: a horizontal line that extends forever to the right.',
  parallelChannel: 'Click three times to draw two parallel trend lines (a channel).',
  priceChannel: 'Click three times to draw a channel anchored to a linear regression line.',
  fib: 'Click twice between a swing low and swing high to draw Fibonacci retracement levels.',
  rect: 'Click twice to draw a rectangle between two corners.',
  circle: 'Click twice: the first point is the center, the second sets the radius.',
  polygon: 'Click repeatedly to add corners; double-click (or press the tool again) to close the shape.',
  arc: 'Click three times to draw an arc through the points.',
  text: 'Click once to place a text annotation, then type.',
  headShoulders: 'Click 5 points: left base, left shoulder, head, right shoulder, right base — a topping reversal pattern.',
  invHeadShoulders: 'Click 5 points for the bottoming mirror of Head & Shoulders — a reversal pattern.',
  doubleTop: 'Click 3 points marking two peaks at a similar level — a bearish reversal pattern.',
  doubleBottom: 'Click 3 points marking two troughs at a similar level — a bullish reversal pattern.',
  triangleAsc: 'Click 4 points: a flat top with a rising bottom trendline — typically a bullish continuation.',
  triangleDesc: 'Click 4 points: a flat bottom with a falling top trendline — typically a bearish continuation.',
  triangleSym: 'Click 4 points: converging trendlines from both sides — a breakout-pending consolidation.',
  wedgeRising: 'Click 4 points: two rising trendlines converging — often a bearish reversal signal.',
  wedgeFalling: 'Click 4 points: two falling trendlines converging — often a bullish reversal signal.',
  flagBull: 'Click 4 points marking a brief down-sloping consolidation after an up-move — a bullish continuation.',
  flagBear: 'Click 4 points marking a brief up-sloping consolidation after a down-move — a bearish continuation.',
  cupHandle: 'Click 3 points tracing a rounded bottom (cup) followed by a small pullback (handle) — a bullish continuation.',
  harmonicXABCD: 'Click 5 points (X-A-B-C-D) to mark a 5-point harmonic structure; D is the typical reversal zone.',
  harmonicABCD: 'Click 4 points (A-B-C-D) to mark a 4-point harmonic structure; D is the typical reversal zone.',
}

export const INDICATOR_INFO: Record<string, string> = {
  MA: 'Simple Moving Average smooths price over N periods. Used to identify trend direction and dynamic support/resistance.',
  EMA: 'Exponential Moving Average weights recent prices more heavily than older ones — faster to respond than SMA.',
  SMA: 'A second, independently-configurable Simple Moving Average line, for comparing two periods at once.',
  BBI: 'Bull and Bear Index averages four moving averages of different lengths into one smoothed trend line.',
  BOLL: 'Bollinger Bands plot standard-deviation bands around a moving average. Touching a band signals extension; band width measures volatility.',
  SAR: 'Parabolic SAR plots dots that flip above/below price to signal potential trend reversals and trailing-stop levels.',
  MACD: 'Tracks the spread between two EMAs. Signal-line crossovers and histogram expansion signal momentum shifts.',
  RSI: 'Relative Strength Index measures momentum on a 0–100 scale. Above 70 is overbought, below 30 is oversold.',
  KDJ: 'Stochastic oscillator comparing close to the recent high-low range. %K/%D crossovers signal momentum turns.',
  CCI: 'Commodity Channel Index measures deviation of price from its average. Extremes signal overbought/oversold conditions.',
  WR: "Williams %R measures how close price is to its recent high. Near 0 is overbought, near -100 is oversold.",
  BIAS: 'Measures the percentage deviation of price from its moving average — a mean-reversion gauge.',
  BRAR: 'A pair of sentiment oscillators (AR/BR) comparing open/high/low/close relationships over N periods.',
  CR: 'Compares today\'s price range against a prior mid-price, a momentum/sentiment variant of BRAR.',
  DMA: 'Difference of two moving averages, smoothed by a third — a trend-following crossover signal.',
  DMI: 'Directional Movement Index (+DI/-DI) with ADX. ADX above 25 indicates a strong trend regardless of direction.',
  EMV: 'Ease of Movement combines price change and volume into one line — low volume + big moves stand out.',
  MTM: 'Momentum is the raw difference between current price and price N periods ago — shows rate of change unscaled.',
  OBV: 'On Balance Volume accumulates volume by up/down days. Divergence from price suggests volume isn\'t confirming the move.',
  PSY: 'Psychological Line is the percentage of up days over N periods — a simple sentiment gauge.',
  PVT: 'Price-Volume Trend accumulates volume weighted by the percentage price change each bar.',
  ROC: 'Rate of Change is the percentage price change over N periods — a normalized momentum reading.',
  TRIX: 'Triple-smoothed EMA rate of change — filters out short-term noise to show longer trend momentum.',
  VR: 'Volume Ratio compares up-day volume to down-day volume over N periods.',
  AO: 'Awesome Oscillator is the difference between a fast and slow simple moving average of the midpoint price.',
  AVP: 'Average price indicator — a smoothed line through the typical price of each bar.',
  VOL: 'Volume traded per bar, shown as a histogram colored by that bar\'s direction.',
  AROON: 'Measures how recently price hit its period high/low. Near 100 means a recent extreme — trend intact.',
  AD: 'Accumulation/Distribution weights volume by where price closed within its high-low range each bar.',
}
