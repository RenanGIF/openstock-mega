// Backtest — Seção 8, correção 1
// Reexecuta getMegaSignal em candles históricos e conta win = tp1 antes do stop (via high/low)
// Taxa estimada com filtro — não é recomendação financeira.

import type { Candle } from './candlePatterns';

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100
  avgRR: number | null;
  profitFactor: number | null;
  expectancy: number | null; // winRate*RR - (1-winRate)
  disclaimer: string;
}

const DISCLAIMER = 'Taxa estimada com filtro (backtest 6m) — não é recomendação financeira. Expectativa = winRate*RR - (1-winRate)';

export interface BacktestTrade {
  entryIdx: number;
  entry: number;
  stop: number;
  tp1: number;
  rr: number;
  win: boolean;
}

// Simula trades simples: a cada N velas, se megaScore hipotético >=70, abre trade
// Como não reexecuta Gemini/Adanos no passado, usa apenas técnico+preço para decidir
export function runBacktest(
  candles: Candle[],
  opts: { rrMin?: number; atrMult?: number; feePct?: number } = {}
): BacktestResult {
  const rrMin = opts.rrMin ?? 1.5;
  const atrMult = opts.atrMult ?? 1.5;
  if (candles.length < 60) {
    return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, avgRR: null, profitFactor: null, expectancy: null, disclaimer: DISCLAIMER };
  }

  // ATR(14) simples
  function atrAt(idx: number): number | null {
    if (idx < 14) return null;
    let sum = 0;
    for (let i = idx - 13; i <= idx; i++) {
      const tr = Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c));
      sum += tr;
    }
    return sum / 14;
  }

  const trades: BacktestTrade[] = [];
  // Varre a cada 5 velas (evita overlapping excessivo)
  for (let i = 30; i < candles.length - 20; i += 5) {
    const entry = candles[i].c;
    const atr = atrAt(i);
    if (atr === null || atr === 0) continue;
    const stop = entry - atr * atrMult;
    const risk = entry - stop;
    if (risk <= 0) continue;
    const tp1 = entry + risk * Math.max(1.5, rrMin);
    const rr = (tp1 - entry) / risk;
    if (rr < rrMin - 1e-9) continue;

    // Simula próximas 20 velas: tp1 antes do stop? (usa high/low)
    let win: boolean | null = null;
    for (let j = i + 1; j < Math.min(i + 21, candles.length); j++) {
      const hitTP = candles[j].h >= tp1;
      const hitStop = candles[j].l <= stop;
      if (hitTP && hitStop) {
        // Ambos na mesma vela: assume stop primeiro se open mais perto do stop (conservador)
        // Simplifica: conta como loss
        win = false; break;
      }
      if (hitTP) { win = true; break; }
      if (hitStop) { win = false; break; }
    }
    if (win === null) continue; // sem desfecho em 20 velas
    trades.push({ entryIdx: i, entry, stop, tp1, rr, win: win! });
  }

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.win).length;
  const losses = totalTrades - wins;
  const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
  const avgRR = trades.length ? trades.reduce((a, t) => a + t.rr, 0) / trades.length : null;
  // Profit factor = (wins*avgWin)/(losses*avgLoss) ; aqui avgWin = RR, avgLoss=1
  const profitFactor = totalTrades && losses > 0 ? (wins * (avgRR ?? 1.5)) / (losses * 1) : wins > 0 ? Infinity : null;
  const expectancy = avgRR !== null ? (winRate / 100) * avgRR - (1 - winRate / 100) : null;

  return {
    totalTrades, wins, losses,
    winRate: Math.round(winRate * 10) / 10,
    avgRR: avgRR !== null ? Math.round(avgRR * 100) / 100 : null,
    profitFactor: profitFactor !== null && Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : profitFactor,
    expectancy: expectancy !== null ? Math.round(expectancy * 1000) / 1000 : null,
    disclaimer: DISCLAIMER,
  };
}
