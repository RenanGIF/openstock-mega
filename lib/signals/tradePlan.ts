// Trade Plan — Seção 7 do PROMPT MASTER
// getTradePlan(mega) => TradePlan | Blocked

import type { MegaSignal } from './mega-signal';
import { getTradingMode, type TradingModeId } from './tradingModes';

export interface TradePlan {
  blocked: false;
  approved: true;
  entry: number;
  stopLoss: number;
  stopPct: number;
  tp1: number;
  tp1Pct: number;
  tp2: number | null;
  tp2Pct: number | null;
  rr: number;
  volumeRatio: number | null;
  atr: number | null;
  symbol: string;
  mode: string;
  signal: string;
  megaScore: number;
}

export interface BlockedPlan {
  blocked: true;
  reason: string;
  rr: number | null;
  volumeRatio: number | null;
  estimatedWinRateWithoutFilter: string;
  withFilter: string;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
}

export type TradePlanResult = TradePlan | BlockedPlan;

export function getTradePlan(mega: MegaSignal): TradePlanResult {
  const mode = getTradingMode(mega.mode as TradingModeId);
  const isBuy = mega.signal === 'COMPRA';
  const entry = mega.lastClose;

  if (entry === null || entry === 0) {
    return {
      blocked: true,
      reason: 'Sem cotação (lastClose indisponível)',
      rr: null,
      volumeRatio: mega.volumeRatio,
      estimatedWinRateWithoutFilter: '52%',
      withFilter: '58%',
    };
  }

  // Stop: conservador entre ATR*mult e suporte/resistência
  let stopLoss: number;
  const atrStop = mega.atr !== null ? (isBuy ? entry - mega.atr * mode.atrMultiplierStop : entry + mega.atr * mode.atrMultiplierStop) : null;

  if (isBuy) {
    // Para compra: stop abaixo; pega o MAIS PRÓXIMO da entrada (menos loss)
    const supportStop = mega.support !== null ? mega.support * 0.99 : null;
    if (atrStop !== null && supportStop !== null) stopLoss = Math.max(atrStop, supportStop);
    else if (atrStop !== null) stopLoss = atrStop;
    else if (supportStop !== null) stopLoss = supportStop;
    else stopLoss = entry * 0.975; // fallback 2.5%
  } else {
    // Para venda: stop acima
    const resStop = mega.resistance !== null ? mega.resistance * 1.01 : null;
    if (atrStop !== null && resStop !== null) stopLoss = Math.min(atrStop, resStop);
    else if (atrStop !== null) stopLoss = atrStop;
    else if (resStop !== null) stopLoss = resStop;
    else stopLoss = entry * 1.025;
  }

  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0 || !Number.isFinite(risk)) {
    return { blocked: true, reason: 'Risco inválido (ATR/suporte)', rr: null, volumeRatio: mega.volumeRatio, estimatedWinRateWithoutFilter: '52%', withFilter: '58%' };
  }

  // TP1: 1.5x risco (ou rrMin se maior)
  const rrTarget = Math.max(1.5, mode.rrMin);
  const tp1 = isBuy ? entry + risk * rrTarget : entry - risk * rrTarget;
  // TP2: próxima resistência/suporte ou 2.5x
  let tp2: number | null = null;
  if (isBuy && mega.resistance !== null && mega.resistance > entry) tp2 = mega.resistance;
  else if (!isBuy && mega.support !== null && mega.support < entry) tp2 = mega.support;
  else tp2 = isBuy ? entry + risk * 2.5 : entry - risk * 2.5;

  const rr = Math.abs(tp1 - entry) / risk;
  const volumeRatio = mega.volumeRatio;

  const stopPct = ((stopLoss - entry) / entry) * 100;
  const tp1Pct = ((tp1 - entry) / entry) * 100;
  const tp2Pct = tp2 !== null ? ((tp2 - entry) / entry) * 100 : null;

  // Filtro bloqueante (Seção 7)
  const rrFail = rr < mode.rrMin - 1e-9;
  const volFail = volumeRatio !== null ? volumeRatio < mode.volumeMultiplierMin - 1e-9 : false;

  if (rrFail || volFail) {
    const reasons: string[] = [];
    if (rrFail) reasons.push(`RR 1:${rr.toFixed(2)} < mínimo 1:${mode.rrMin.toFixed(1)}`);
    if (volFail) reasons.push(`Volume ${volumeRatio!.toFixed(2)}x < média ${mode.volumeMultiplierMin.toFixed(1)}x`);
    return {
      blocked: true,
      reason: reasons.join(' e '),
      rr: Math.round(rr * 100) / 100,
      volumeRatio,
      estimatedWinRateWithoutFilter: '52%',
      withFilter: '58%',
      entry, stopLoss, tp1,
    };
  }

  return {
    blocked: false,
    approved: true,
    entry, stopLoss, stopPct: Math.round(stopPct * 100) / 100,
    tp1, tp1Pct: Math.round(tp1Pct * 100) / 100,
    tp2, tp2Pct: tp2Pct !== null ? Math.round(tp2Pct * 100) / 100 : null,
    rr: Math.round(rr * 100) / 100,
    volumeRatio, atr: mega.atr,
    symbol: mega.symbol, mode: mega.mode, signal: mega.signal, megaScore: mega.megaScore,
  };
}
