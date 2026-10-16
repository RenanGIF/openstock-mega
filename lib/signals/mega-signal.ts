// Orquestrador MEGA — Seção 7 do PROMPT MASTER
// getMegaSignal(symbol, modeId) => MegaSignal | { status: 'market_closed' }

import { getTradingMode, getEffectiveWeights, type TradingModeId } from './tradingModes';
import { detectPatterns, type Candle, type DetectedPattern } from './candlePatterns';
import { getStockSentimentInsights } from '@/lib/actions/adanos.actions';
import { getNews } from '@/lib/actions/finnhub.actions';
import { getMarket, isMarketOpen, hasFinnhubQuotes, MARKETS } from '@/lib/markets';
import { isInternationalSymbol } from '@/lib/utils';

const FINNHUB_BASE_URL = process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1';
const FINNHUB_KEYS = (process.env.FINNHUB_API_KEYS || process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || '')
  .split(',').map(k => k.trim()).filter(Boolean);
let nextKeyIndex = 0;
function finnhubKey() {
  if (!FINNHUB_KEYS.length) return '';
  return FINNHUB_KEYS[nextKeyIndex++ % FINNHUB_KEYS.length];
}

// ---------- Tipos ----------
export type MegaSignalStatus = 'ok' | 'market_closed';
export interface MegaSignal {
  symbol: string;
  mode: string;
  status: 'ok';
  megaScore: number;
  signal: 'COMPRA' | 'VENDA' | 'NEUTRO';
  pillars: { social: number; news: number; technical: number; price: number };
  effectiveWeights: { social: number; news: number; technical: number; price: number; socialUnavailable?: boolean };
  patterns: DetectedPattern[];
  newsArticles: Array<{ headline: string; sentiment?: string }>;
  newsScore: number;
  socialUnavailable: boolean;
  bullishAverage: number | null;
  support: number | null;
  resistance: number | null;
  atr: number | null;
  volumeRatio: number | null;
  lastClose: number | null;
  rsi: number | null;
}

function getMarketForSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  if (upper.startsWith('BINANCE:')) return MARKETS.find(m => m.id === 'crypto')!;
  if (upper.startsWith('FX:')) return MARKETS.find(m => m.id === 'fx')!;
  if (isInternationalSymbol(upper) || upper.endsWith('.SA') || upper.includes('BMFBOVESPA')) {
    // BR market may not exist yet — fallback to us for isMarketOpen check, but we try br
    return MARKETS.find(m => (m as { id: string }).id === 'br') ?? MARKETS[0];
  }
  return MARKETS.find(m => m.id === 'us')!;
}

// ---------- Candles ----------
async function fetchFinnhubCandles(symbol: string, resolution: string, from: number, to: number): Promise<Candle[] | null> {
  const key = finnhubKey();
  if (!key) return null;
  // Forex uses /forex/candle with OANDA symbol
  const isForex = symbol.toUpperCase().startsWith('FX:');
  let url: string;
  let finnhubSymbol = symbol;
  if (isForex) {
    // FX:USDJPY -> OANDA:USD_JPY
    const pair = symbol.toUpperCase().replace('FX:', '');
    const oanda = pair.length === 6 ? `${pair.slice(0, 3)}_${pair.slice(3)}` : pair;
    finnhubSymbol = `OANDA:${oanda}`;
    url = `${FINNHUB_BASE_URL}/forex/candle?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=${resolution}&from=${from}&to=${to}`;
  } else {
    url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`;
  }
  try {
    const res = await fetch(url, { headers: { 'X-Finnhub-Token': key }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as { s: string; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[]; t?: number[] };
    if (data.s !== 'ok' || !data.c || !data.o) return null;
    const len = data.c.length;
    const out: Candle[] = [];
    for (let i = 0; i < len; i++) out.push({ o: data.o[i], h: data.h![i], l: data.l![i], c: data.c[i], v: data.v?.[i] ?? 0, t: data.t?.[i] ?? 0 });
    return out;
  } catch { return null; }
}

function mapToYahooSymbol(symbol: string): string {
  const u = symbol.toUpperCase();
  if (u.startsWith('BINANCE:')) {
    // BINANCE:BTCUSDT -> BTC-USD, BINANCE:ETHUSDT -> ETH-USD
    const base = u.replace('BINANCE:', '').replace('USDT', '');
    return `${base}-USD`;
  }
  if (u.startsWith('FX:')) {
    // FX:USDJPY -> USDJPY=X
    return u.replace('FX:', '').replace('/', '') + '=X';
  }
  if (u === 'BMFBOVESPA:IBOV' || u === '^BVSP') return '^BVSP';
  return symbol; // PETR4.SA stays
}

type YahooChartResult = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
  };
};

async function fetchYahooCandles(symbol: string, interval: string): Promise<Candle[] | null> {
  const yahooSymbol = mapToYahooSymbol(symbol);
  const yInterval = interval === '5' ? '5m' : interval === '60' ? '60m' : interval === 'D' ? '1d' : '5m';
  const range = interval === 'D' ? '6mo' : '5d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${yInterval}&range=${range}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as YahooChartResult;
    const result = data.chart?.result?.[0];
    const q = result?.indicators?.quote?.[0];
    const ts = result?.timestamp;
    if (!q || !ts) return null;
    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      out.push({ o, h, l, c, v: v ?? 0, t: ts[i] });
    }
    return out.length >= 20 ? out : null;
  } catch { return null; }
}

async function getCandles(symbol: string, resolution: string): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  // 5 days for 5m, 180 days for D
  const days = resolution === 'D' ? 180 : 5;
  const from = now - days * 86400;
  let candles = await fetchFinnhubCandles(symbol, resolution, from, now);
  if (candles && candles.length >= 25) return candles;
  // Fallback Yahoo if Finnhub 403 / insufficient
  if (!hasFinnhubQuotes(symbol) || !candles) {
    const yahoo = await fetchYahooCandles(symbol, resolution);
    if (yahoo && yahoo.length >= 25) return yahoo;
  }
  return candles ?? [];
}

// ---------- Indicadores locais (technicalindicators opcional) ----------
async function calcIndicators(candles: Candle[]) {
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const volumes = candles.map(c => c.v);

  let rsi: number | null = null, sma20: number | null = null, sma50: number | null = null, atr: number | null = null, volSma20: number | null = null;

  try {
    const TI = await import('technicalindicators');
    if (closes.length >= 14) {
      const rsiArr = TI.RSI.calculate({ period: 14, values: closes });
      rsi = rsiArr.length ? rsiArr[rsiArr.length - 1] : null;
    }
    if (closes.length >= 20) {
      const smaArr = TI.SMA.calculate({ period: 20, values: closes });
      sma20 = smaArr.length ? smaArr[smaArr.length - 1] : null;
    }
    if (closes.length >= 50) {
      const smaArr = TI.SMA.calculate({ period: 50, values: closes });
      sma50 = smaArr.length ? smaArr[smaArr.length - 1] : null;
    }
    if (candles.length >= 14) {
      const atrArr = TI.ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
      atr = atrArr.length ? atrArr[atrArr.length - 1] : null;
    }
    if (volumes.length >= 20) {
      const vsmaArr = TI.SMA.calculate({ period: 20, values: volumes });
      volSma20 = vsmaArr.length ? vsmaArr[vsmaArr.length - 1] : null;
    }
  } catch {
    // fallback simples: RSI manual já está em candlePatterns, aqui só ATR/vol
    if (volumes.length >= 20) volSma20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  }

  // S/R local (swing)
  let support: number | null = null, resistance: number | null = null;
  // swing detection simples
  const supports: number[] = [], resistances: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l && candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) supports.push(candles[i].l);
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h && candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) resistances.push(candles[i].h);
  }
  // Usa última vela FECHADA (com volume>0) para close/suporte/volume — ignora candle incompleto/after-hours com v=0
  let lastIdx = closes.length - 1;
  while (lastIdx > 0 && (volumes[lastIdx] === 0 || volumes[lastIdx] == null)) lastIdx--;
  const lastClose = closes[lastIdx];
  if (supports.length) {
    supports.sort((a, b) => Math.abs(a - lastClose) - Math.abs(b - lastClose));
    support = supports[0];
  }
  if (resistances.length) {
    resistances.sort((a, b) => Math.abs(a - lastClose) - Math.abs(b - lastClose));
    resistance = resistances[0];
  }

  const lastVol = volumes[lastIdx];
  // SMA20 só de velas com volume>0 (ignora zeros do after-hours que distorcem média)
  let volSma20Filtered: number | null = null;
  {
    const vols = volumes.filter(v => v != null && v > 0);
    if (vols.length >= 20) {
      try {
        const TI = await import('technicalindicators');
        const arr = TI.SMA.calculate({ period: 20, values: vols });
        volSma20Filtered = arr.length ? arr[arr.length - 1] : vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
      } catch { volSma20Filtered = vols.slice(-20).reduce((a, b) => a + b, 0) / 20; }
    } else if (vols.length >= 5) {
      volSma20Filtered = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length);
    }
  }
  const volumeRatio = volSma20Filtered && volSma20Filtered > 0 ? lastVol / volSma20Filtered : null;

  return { rsi, sma20, sma50, atr, volSma20, volumeRatio, support, resistance, lastClose };
}

// ---------- Notícias: classificação Gemini (batch) ----------
async function classifyNews(symbol: string, articles: Array<{ headline: string }>): Promise<number> {
  if (!articles.length) return 50;
  const key = process.env.GEMINI_API_KEY || process.env.MINIMAX_API_KEY || '';
  if (!key) return 50;
  try {
    const { callAIProviderWithFallback } = await import('@/lib/ai-provider');
    const headlines = articles.slice(0, 6).map(a => `- ${a.headline}`).join('\n');
    const prompt = `Classifique cada headline abaixo como positivo, negativo ou neutro para o ticker ${symbol}.\nRetorne APENAS JSON: {"positive": <0-100>, "negative": <0-100>, "neutral": <0-100>, "score": <0-100 onde 100=tudo positivo>}\nHeadlines:\n${headlines}`;
    const raw = await callAIProviderWithFallback(prompt);
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.score === 'number' && parsed.score >= 0 && parsed.score <= 100) return Math.round(parsed.score);
    // fallback: positive %
    if (typeof parsed.positive === 'number') return Math.round(parsed.positive);
    return 50;
  } catch { return 50; }
}

// ---------- getMegaSignal ----------
export async function getMegaSignal(symbol: string, modeId: TradingModeId): Promise<MegaSignal | { status: 'market_closed'; symbol: string; mode: string }> {
  const mode = getTradingMode(modeId);
  const market = getMarketForSymbol(symbol);

  // Trava isMarketOpen (Seção 8, correção 4)
  if (!isMarketOpen(market)) {
    return { status: 'market_closed', symbol, mode: mode.id };
  }

  // Paralelo: social, news, candles
  const [sentiment, newsRaw, candles] = await Promise.all([
    getStockSentimentInsights(symbol).catch(() => null),
    getNews([symbol]).catch(() => []),
    getCandles(symbol, mode.finnhubResolution),
  ]);

  const socialUnavailable = !sentiment || sentiment.availableSources === 0;
  const bullishAverage = sentiment?.bullishAverage ?? null;
  const socialScore = bullishAverage !== null ? Math.round(bullishAverage) : 0;

  const newsScore = await classifyNews(symbol, newsRaw as Array<{ headline: string }>);
  const newsArticles = (newsRaw as Array<{ headline: string; url?: string }>).slice(0, 6);

  // Técnico + Preço
  let technicalScore = 50;
  let priceScore = 50;
  let patterns: DetectedPattern[] = [];
  let atr: number | null = null;
  let volumeRatio: number | null = null;
  let support: number | null = null;
  let resistance: number | null = null;
  let lastClose: number | null = null;
  let rsi: number | null = null;

  if (candles.length >= 25) {
    const ind = await calcIndicators(candles);
    atr = ind.atr; volumeRatio = ind.volumeRatio; support = ind.support; resistance = ind.resistance; lastClose = ind.lastClose; rsi = ind.rsi;
    patterns = detectPatterns(candles, { volumeMultiplier: 1.0, requireConfirmation: true });
    // Técnico: 50 + padrões + bonus RSI/MACD
    // Se há padrões bullish, empurra para cima; bearish empurra para baixo?
    // Para simplificar: conta bullish vs bearish
    const bullishCount = patterns.filter(p => p.type === 'bullish').length;
    const bearishCount = patterns.filter(p => p.type === 'bearish').length;
    const net = bullishCount - bearishCount;
    // Cada padrão bullish +15, bearish -15 (cap)
    technicalScore = Math.max(0, Math.min(100, 50 + net * 15 + (patterns.some(p => p.name.includes('Manhã') || p.name.includes('Noite')) ? (net > 0 ? 5 : -5) : 0)));
    // Bonus RSI: se 50-60 neutro => 60, se 30-40 oversold => bearish
    if (rsi !== null) {
      if (rsi > 65 && rsi < 70) technicalScore = Math.min(100, technicalScore + 5);
      if (rsi < 35 && rsi > 30) technicalScore = Math.max(0, technicalScore - 5);
    }
    // Preço: distância até resistência
    if (resistance !== null && lastClose !== null) {
      const distPct = Math.abs(resistance - lastClose) / lastClose;
      if (distPct < 0.02) priceScore = 45; // colado na resistência = risco
      else if (distPct < 0.05) priceScore = 65;
      else priceScore = 85;
    } else {
      priceScore = 60;
    }
  }

  const effectiveWeights = getEffectiveWeights(mode, socialUnavailable) as { social: number; news: number; technical: number; price: number; socialUnavailable?: boolean };

  // Normaliza pesos: se socialUnavailable, social=0 e os outros já somam 1.0
  const megaScore = Math.round(
    (socialUnavailable ? 0 : socialScore * effectiveWeights.social) +
    newsScore * effectiveWeights.news +
    technicalScore * effectiveWeights.technical +
    priceScore * effectiveWeights.price
  );

  const signal: MegaSignal['signal'] = megaScore >= 70 ? 'COMPRA' : megaScore <= 30 ? 'VENDA' : 'NEUTRO';

  return {
    symbol: symbol.toUpperCase(),
    mode: mode.id,
    status: 'ok',
    megaScore: Math.max(0, Math.min(100, megaScore)),
    signal,
    pillars: { social: socialScore, news: newsScore, technical: technicalScore, price: priceScore },
    effectiveWeights: effectiveWeights as MegaSignal['effectiveWeights'],
    patterns,
    newsArticles: newsArticles as MegaSignal['newsArticles'],
    newsScore,
    socialUnavailable,
    bullishAverage,
    support,
    resistance,
    atr,
    volumeRatio,
    lastClose,
    rsi,
  };
}
