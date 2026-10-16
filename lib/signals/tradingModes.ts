// Seletor "O que estou operando?" — Seção 5 do PROMPT MASTER (valores fechados, não inventar)
export type TradingModeId = 'scalp-acao' | 'scalp-crypto' | 'swing';

export interface TradingMode {
  id: TradingModeId;
  label: string;
  description: string;
  weights: { social: number; news: number; technical: number; price: number }; // soma 1.0
  timeframe: '1m' | '5m' | '15m' | '1D';
  atrMultiplierStop: number;
  rrMin: number;
  volumeMultiplierMin: number;
  cooldownMinutes: number;
  finnhubResolution: string; // "1" | "5" | "60" | "D"
}

export const TRADING_MODES: Record<TradingModeId, TradingMode> = {
  'scalp-acao': {
    id: 'scalp-acao',
    label: 'SCALP AÇÃO US ● LIVE 15s',
    description: 'Ações US com cotação 15s (self-host realtime). TF 5min.',
    weights: { social: 0.15, news: 0.15, technical: 0.45, price: 0.25 },
    timeframe: '5m',
    atrMultiplierStop: 1.5,
    rrMin: 1.5,
    volumeMultiplierMin: 1.0,
    cooldownMinutes: 30,
    finnhubResolution: '5',
  },
  'scalp-crypto': {
    id: 'scalp-crypto',
    label: 'SCALP CRYPTO ● 24/7',
    description: 'Crypto Binance 24/7. Stop maior (ATR*2.5) e RR mais rigoroso.',
    weights: { social: 0.10, news: 0.15, technical: 0.45, price: 0.30 },
    timeframe: '5m',
    atrMultiplierStop: 2.5,
    rrMin: 2.0,
    volumeMultiplierMin: 1.0,
    cooldownMinutes: 30,
    finnhubResolution: '5',
  },
  swing: {
    id: 'swing',
    label: 'SWING (B3/Forex)',
    description: 'B3/Forex com delay 15min no grátis. TF 1D.',
    weights: { social: 0.30, news: 0.25, technical: 0.25, price: 0.20 },
    timeframe: '1D',
    atrMultiplierStop: 1.5,
    rrMin: 2.5,
    volumeMultiplierMin: 1.0,
    cooldownMinutes: 60,
    finnhubResolution: 'D',
  },
};

export const DEFAULT_TRADING_MODE_ID: TradingModeId = 'scalp-acao';

export function getTradingMode(id: string | null | undefined): TradingMode {
  if (id && id in TRADING_MODES) return TRADING_MODES[id as TradingModeId];
  return TRADING_MODES[DEFAULT_TRADING_MODE_ID];
}

export function isValidTradingModeId(id: string): id is TradingModeId {
  return id in TRADING_MODES;
}

// Ativos exibidos por modo (Seção 5 + confirmação do usuário)
export const MODE_ASSETS: Record<TradingModeId, string[]> = {
  'scalp-acao': ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'JPM', 'DIA', 'IWM', 'GOOGL', 'AMZN'],
  'scalp-crypto': ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT', 'BINANCE:BNBUSDT', 'BINANCE:XRPUSDT'],
  swing: ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BMFBOVESPA:IBOV', 'FX:USDJPY', 'FX:EURUSD'],
};

// Redistribuição quando Adanos retorna null (Seção 8, correção 6)
export function getEffectiveWeights(mode: TradingMode, socialUnavailable: boolean) {
  if (!socialUnavailable) return mode.weights;
  // Ex: scalp-acao 15/15/45/25 -> sem social: News 20% + Técnico 55% + Preço 25%
  // Regra genérica: redistribui peso social proporcionalmente aos 3 restantes
  const { social, news, technical, price } = mode.weights;
  const remaining = news + technical + price; // = 1 - social
  const factor = 1 / remaining;
  return {
    social: 0,
    news: Math.round(news * factor * 100) / 100,
    technical: Math.round(technical * factor * 100) / 100,
    price: Math.round(price * factor * 100) / 100,
    socialUnavailable: true as const,
  };
}
