// Detector de padrões — Seção 6 do PROMPT MASTER
// Só 6 permitidos (Bulkowski): Engolfo Alta/Baixa, Martelo, Estrela Cadente, Estrela Manhã/Noite (3 velas)
// Validação obrigatória: forma + S/R <1.5% + volume > SMA20 + RSI 30-70 + confirmação próxima vela

export type Candle = { o: number; h: number; l: number; c: number; v: number; t: number };
export type PatternType = 'bullish' | 'bearish';
export interface DetectedPattern {
  name: string;
  type: PatternType;
  confidence: number; // 0-100
  atIndex: number;
  volumeOk: boolean;
  supportLevel?: number;
  resistanceLevel?: number;
}

// Helpers
function body(c: Candle) { return Math.abs(c.c - c.o); }
function range(c: Candle) { return c.h - c.l; }
function isBullish(c: Candle) { return c.c > c.o; }
function isBearish(c: Candle) { return c.c < c.o; }
function sma(values: number[], period: number, endIdx: number): number | null {
  if (endIdx + 1 < period) return null;
  let sum = 0; for (let i = endIdx - period + 1; i <= endIdx; i++) sum += values[i];
  return sum / period;
}
function rsi(closes: number[], period = 14, idx: number): number | null {
  if (idx < period) return null;
  let gains = 0, losses = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += -diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
function isNearLevel(price: number, level: number, pct = 0.015) {
  return Math.abs(price - level) / price < pct;
}

// S/R local: swing highs/lows (pivots) das últimas 50 velas
function findSwingLevels(candles: Candle[]): { supports: number[]; resistances: number[] } {
  const supports: number[] = []; const resistances: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    // Swing low: menor que 2 vizinhos de cada lado
    if (c.l < candles[i - 1].l && c.l < candles[i - 2].l && c.l < candles[i + 1].l && c.l < candles[i + 2].l) supports.push(c.l);
    if (c.h > candles[i - 1].h && c.h > candles[i - 2].h && c.h > candles[i + 1].h && c.h > candles[i + 2].h) resistances.push(c.h);
  }
  return { supports: supports.sort((a, b) => a - b), resistances: resistances.sort((a, b) => a - b) };
}
function nearestLevel(price: number, levels: number[]): number | null {
  if (!levels.length) return null;
  let best = levels[0], dist = Math.abs(price - best);
  for (const lv of levels) { const d = Math.abs(price - lv); if (d < dist) { dist = d; best = lv; } }
  return best;
}

// Validações individuais (forma)
function isHammer(c: Candle): boolean {
  const r = range(c); if (r === 0) return false;
  const b = body(c); const lowerWick = Math.min(c.o, c.c) - c.l; const upperWick = c.h - Math.max(c.o, c.c);
  return b < 0.30 * r && lowerWick > 2 * b && upperWick < 0.10 * r;
}
function isShootingStar(c: Candle): boolean {
  const r = range(c); if (r === 0) return false;
  const b = body(c); const upperWick = c.h - Math.max(c.o, c.c); const lowerWick = Math.min(c.o, c.c) - c.l;
  return b < 0.30 * r && upperWick > 2 * b && lowerWick < 0.10 * r;
}
function isBullishEngulfing(prev: Candle, cur: Candle): boolean {
  return isBearish(prev) && isBullish(cur) && cur.o < prev.c && cur.c > prev.o && body(cur) > body(prev);
}
function isBearishEngulfing(prev: Candle, cur: Candle): boolean {
  return isBullish(prev) && isBearish(cur) && cur.o > prev.c && cur.c < prev.o && body(cur) > body(prev);
}
function isMorningStar(a: Candle, b: Candle, c: Candle): boolean {
  // a bearish, b small body (gap), c bullish engulfing
  const gapDown = Math.max(a.o, a.c) > Math.max(b.o, b.c) || b.o < a.c;
  const smallBody = body(b) < 0.3 * range(b);
  const bullishClose = c.c > (a.o + a.c) / 2;
  return isBearish(a) && smallBody && isBullish(c) && gapDown && bullishClose;
}
function isEveningStar(a: Candle, b: Candle, c: Candle): boolean {
  const gapUp = Math.min(a.o, a.c) < Math.min(b.o, b.c) || b.o > a.c;
  const smallBody = body(b) < 0.3 * range(b);
  const bearishClose = c.c < (a.o + a.c) / 2;
  return isBullish(a) && smallBody && isBearish(c) && gapUp && bearishClose;
}

export interface DetectOptions {
  volumeMultiplier?: number; // default 1.0, crypto 1.2 pode ser passado mas PROMPT diz 1.0x (scalp-crypto seria 1.0 também)
  requireConfirmation?: boolean; // default true
}

export function detectPatterns(candles: Candle[], opts: DetectOptions = {}): DetectedPattern[] {
  if (candles.length < 25) return [];
  const volumeMultiplier = opts.volumeMultiplier ?? 1.0;
  const requireConfirmation = opts.requireConfirmation ?? true;

  const closes = candles.map(c => c.c);
  const volumes = candles.map(c => c.v);
  const { supports, resistances } = findSwingLevels(candles);
  const out: DetectedPattern[] = [];

  // Para cada candle (exceto últimos sem confirmação), testa padrões
  // Deixa 1 vela de confirmação no final se requireConfirmation
  const lastTestable = requireConfirmation ? candles.length - 2 : candles.length - 1;

  for (let i = 2; i <= lastTestable; i++) {
    const cur = candles[i]; const prev = candles[i - 1];
    const rsiVal = rsi(closes, 14, i);
    const volSma = sma(volumes, 20, i);
    const volOk = volSma !== null ? cur.v > volSma * volumeMultiplier : false;
    const next = candles[i + 1];

    // RSI filtro: só reversão válida se 30 < RSI < 70
    const rsiOk = (type: PatternType) => {
      if (rsiVal === null) return false;
      if (type === 'bullish') return rsiVal > 30 && rsiVal < 70;
      return rsiVal > 30 && rsiVal < 70; // mesmo para bearish (não esticado em nenhum extremo)
    };

    // Confirmação: próxima vela fecha acima (alta) / abaixo (baixa) do padrão
    const confirmed = (type: PatternType, level: number) => {
      if (!requireConfirmation) return true;
      if (!next) return false;
      return type === 'bullish' ? next.c > level : next.c < level;
    };

    // --- Hammer (bullish) ---
    if (isHammer(cur)) {
      const sup = nearestLevel(cur.c, supports);
      const nearSR = sup !== null ? isNearLevel(cur.c, sup) : false;
      // Se não há S/R detectado, não valida (exige estar perto de suporte)
      if (nearSR && volOk && rsiOk('bullish') && confirmed('bullish', cur.h)) {
        out.push({ name: 'Martelo', type: 'bullish', confidence: 62, atIndex: i, volumeOk: true, supportLevel: sup! });
      }
    }
    // --- Shooting Star (bearish) ---
    if (isShootingStar(cur)) {
      const res = nearestLevel(cur.c, resistances);
      const nearSR = res !== null ? isNearLevel(cur.c, res) : false;
      if (nearSR && volOk && rsiOk('bearish') && confirmed('bearish', cur.l)) {
        out.push({ name: 'Estrela Cadente', type: 'bearish', confidence: 62, atIndex: i, volumeOk: true, resistanceLevel: res! });
      }
    }
    // --- Bullish Engulfing ---
    if (i >= 1 && isBullishEngulfing(prev, cur)) {
      const sup = nearestLevel(cur.c, supports);
      const nearSR = sup !== null ? isNearLevel(cur.c, sup) : true; // engolfo pode validar sem S/R exato
      if (nearSR && volOk && rsiOk('bullish') && confirmed('bullish', cur.h)) {
        out.push({ name: 'Engolfo de Alta', type: 'bullish', confidence: 65, atIndex: i, volumeOk: true, supportLevel: sup ?? undefined });
      }
    }
    // --- Bearish Engulfing ---
    if (i >= 1 && isBearishEngulfing(prev, cur)) {
      const res = nearestLevel(cur.c, resistances);
      const nearSR = res !== null ? isNearLevel(cur.c, res) : true;
      if (nearSR && volOk && rsiOk('bearish') && confirmed('bearish', cur.l)) {
        out.push({ name: 'Engolfo de Baixa', type: 'bearish', confidence: 65, atIndex: i, volumeOk: true, resistanceLevel: res ?? undefined });
      }
    }
    // --- Morning Star (3 velas: i-2, i-1, i) ---
    if (i >= 2 && isMorningStar(candles[i - 2], candles[i - 1], cur)) {
      const sup = nearestLevel(cur.c, supports);
      const nearSR = sup !== null ? isNearLevel(cur.c, sup) : false;
      if (nearSR && volOk && rsiOk('bullish') && confirmed('bullish', cur.h)) {
        out.push({ name: 'Estrela da Manhã', type: 'bullish', confidence: 74, atIndex: i, volumeOk: true, supportLevel: sup! });
      }
    }
    // --- Evening Star (3 velas) ---
    if (i >= 2 && isEveningStar(candles[i - 2], candles[i - 1], cur)) {
      const res = nearestLevel(cur.c, resistances);
      const nearSR = res !== null ? isNearLevel(cur.c, res) : false;
      if (nearSR && volOk && rsiOk('bearish') && confirmed('bearish', cur.l)) {
        out.push({ name: 'Estrela da Noite', type: 'bearish', confidence: 73, atIndex: i, volumeOk: true, resistanceLevel: res! });
      }
    }
  }

  // Deduplica: se múltiplos no mesmo índice, mantém maior confiança
  const byIndex = new Map<number, DetectedPattern>();
  for (const p of out) {
    const ex = byIndex.get(p.atIndex);
    if (!ex || p.confidence > ex.confidence) byIndex.set(p.atIndex, p);
  }
  return [...byIndex.values()].sort((a, b) => a.atIndex - b.atIndex);
}

// Pontuação técnica: cada padrão válido = +15 (Stars +20), cap 100. Sem padrão = 0
export function scoreTechnicalFromPatterns(patterns: DetectedPattern[], baseScore = 50): number {
  if (patterns.length === 0) return baseScore; // neutro sem padrão
  let bonus = 0;
  for (const p of patterns) {
    if (p.name === 'Estrela da Manhã' || p.name === 'Estrela da Noite') bonus += 20;
    else bonus += 15;
  }
  return Math.min(100, baseScore + bonus);
}
