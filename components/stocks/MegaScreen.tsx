'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Panel from '@/components/Panel';
import TradingViewWidget from '@/components/TradingViewWidget';
import { CANDLE_CHART_WIDGET_CONFIG } from '@/lib/constants';
import { formatSymbolForTradingView } from '@/lib/utils';
import { TRADING_MODES, MODE_ASSETS, type TradingModeId, DEFAULT_TRADING_MODE_ID } from '@/lib/signals/tradingModes';
import { hasFinnhubQuotes } from '@/lib/markets';
import { TrendingUp, TrendingDown, Minus, Copy, Check, ExternalLink, AlertTriangle, Clock } from 'lucide-react';

type MegaData = {
  symbol: string; mode: string; status: string; megaScore?: number; signal?: string;
  pillars?: { social: number; news: number; technical: number; price: number };
  effectiveWeights?: { social: number; news: number; technical: number; price: number; socialUnavailable?: boolean };
  patterns?: Array<{ name: string; type: string; confidence: number }>;
  newsArticles?: Array<{ headline: string }>;
  socialUnavailable?: boolean; bullishAverage?: number | null;
  support?: number | null; resistance?: number | null; atr?: number | null; volumeRatio?: number | null; lastClose?: number | null; rsi?: number | null;
};

type PlanData = {
  blocked: boolean; approved?: boolean; reason?: string;
  entry?: number; stopLoss?: number; stopPct?: number; tp1?: number; tp1Pct?: number; tp2?: number | null; tp2Pct?: number | null;
  rr?: number | null; volumeRatio?: number | null;
};

function gaugeColor(score: number) {
  if (score >= 70) return 'text-brand';
  if (score <= 30) return 'text-down';
  return 'text-warn';
}
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }} className="icon-btn h-7 w-7" title="Copiar">
      {done ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export default function MegaScreen() {
  const router = useRouter();
  const sp = useSearchParams();
  const modeId = (sp.get('mode') as TradingModeId) || DEFAULT_TRADING_MODE_ID;
  const symbolParam = sp.get('symbol') || '';
  const mode = TRADING_MODES[modeId] ?? TRADING_MODES[DEFAULT_TRADING_MODE_ID];
  const assets = MODE_ASSETS[modeId] ?? MODE_ASSETS[DEFAULT_TRADING_MODE_ID];
  const activeSymbol = symbolParam || assets[0] || 'NVDA';

  const [mega, setMega] = useState<MegaData | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const setMode = (id: TradingModeId) => {
    const p = new URLSearchParams(sp.toString());
    p.set('mode', id);
    p.set('symbol', MODE_ASSETS[id][0]);
    router.push(`/mega?${p.toString()}`);
  };
  const setSymbol = (s: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set('symbol', s);
    router.push(`/mega?${p.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/mega/signal?symbol=${encodeURIComponent(activeSymbol)}&mode=${modeId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (!cancelled) { setMega(data.mega ?? data); setPlan(data.plan ?? null); } })
      .catch(() => { if (!cancelled) setMega({ symbol: activeSymbol, mode: modeId, status: 'error' } as MegaData); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeSymbol, modeId]);

  const tvSymbol = useMemo(() => formatSymbolForTradingView(activeSymbol), [activeSymbol]);
  const chartConfig = useMemo(() => {
    const base = CANDLE_CHART_WIDGET_CONFIG(tvSymbol);
    return { ...base, interval: mode.timeframe === '1D' ? 'D' : '5' };
  }, [tvSymbol, mode.timeframe]);

  const isBlocked = plan?.blocked === true;
  const isMarketClosed = mega?.status === 'market_closed';

  return (
    <div className="flex flex-col gap-3">
      {/* Header: seletor de modo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="kicker">Você opera:</span>
          <select value={modeId} onChange={e => setMode(e.target.value as TradingModeId)} className="h-9 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-foreground">
            {(Object.keys(TRADING_MODES) as TradingModeId[]).map(id => (
              <option key={id} value={id}>{TRADING_MODES[id].label}</option>
            ))}
          </select>
        </div>
        <span className="pill is-brand">AGPL-3.0</span>
        {loading && <span className="text-sm text-faint">Carregando…</span>}
      </div>

      {/* Barra de ativos */}
      <Panel title={`Ativos — ${mode.label}`} sub={mode.description}>
        <div className="flex flex-wrap gap-2 p-3">
          {assets.map(sym => {
            const isActive = sym === activeSymbol;
            const live = hasFinnhubQuotes(sym);
            const delay = !live;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbol(sym)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-card text-foreground hover:bg-hover'}`}
              >
                <span>{sym}</span>
                {live ? <span className="live-dot" title="LIVE 15s" /> : <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px] font-bold text-warn">DELAY 15min — só Swing</span>}
              </button>
            );
          })}
        </div>
        {modeId !== 'swing' && assets.some(s => !hasFinnhubQuotes(s)) && (
          <p className="px-3 pb-3 text-[12.5px] text-faint">Ativos com DELAY não disparam alerta em modo SCALP. Troque para SWING.</p>
        )}
      </Panel>

      {/* Grid 2 colunas: gráfico + gauge */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,420px)]">
        <Panel title={`Gráfico ${activeSymbol} — ${mode.timeframe}`} sub={isMarketClosed ? 'Mercado fechado' : `TradingView • ${activeSymbol} • ${mode.timeframe}`}>
          <TradingViewWidget scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" config={chartConfig as Record<string, unknown>} height={560} allowExpand />
          {mega?.patterns && mega.patterns.length > 0 && (
            <div className="border-t border-line px-3 py-2 text-[12.5px] text-muted-foreground">
              Padrões detectados: {mega.patterns.map(p => `${p.name} (${p.type})`).join(' • ')}
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel title="MEGA Sentimento" sub={mega?.socialUnavailable ? 'Social indisponível — cálculo com News+Técnico+Preço' : 'Social + Notícias + Técnico + Preço'}>
            {isMarketClosed ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Clock className="size-8 text-faint" />
                <p className="font-semibold text-foreground">Mercado fechado</p>
                <p className="text-sm text-faint">Fora do horário de negociação. O Mega só calcula com mercado aberto.</p>
              </div>
            ) : mega && mega.megaScore !== undefined ? (
              <div className="flex flex-col gap-4 p-4">
                {/* Gauge */}
                <div className="flex items-center gap-4">
                  <div className={`grid h-24 w-24 place-items-center rounded-full border-4 ${mega.megaScore >= 70 ? 'border-brand bg-brand-soft' : mega.megaScore <= 30 ? 'border-down bg-down-soft' : 'border-warn bg-warn/10'}`}>
                    <span className={`text-3xl font-bold ${gaugeColor(mega.megaScore)}`}>{mega.megaScore}%</span>
                  </div>
                  <div className="min-w-0">
                    <p className={`flex items-center gap-2 text-lg font-bold ${gaugeColor(mega.megaScore)}`}>
                      {mega.signal === 'COMPRA' ? <TrendingUp className="size-5" /> : mega.signal === 'VENDA' ? <TrendingDown className="size-5" /> : <Minus className="size-5" />}
                      {mega.signal} • {'●'.repeat(Math.max(1, Math.round(mega.megaScore / 20)))} {'○'.repeat(5 - Math.round(mega.megaScore / 20))}
                    </p>
                    {plan && !plan.blocked ? (
                      <p className="mt-1 text-sm text-muted-foreground">RR 1:{plan.rr?.toFixed(2)} ✅ | Vol {plan.volumeRatio !== null && plan.volumeRatio !== undefined ? Number(plan.volumeRatio).toFixed(2) : '—'}x ✅</p>
                    ) : plan?.blocked ? (
                      <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-warn"><AlertTriangle className="size-4" /> BLOQUEADO: {plan.reason}</p>
                    ) : null}
                  </div>
                </div>

                {/* Barra segmentada */}
                {mega.pillars && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {(['social', 'news', 'technical', 'price'] as const).map(k => (
                      <div key={k} className="rounded-xl bg-hover p-2">
                        <p className="kicker">{k === 'social' ? 'Social' : k === 'news' ? 'News' : k === 'technical' ? 'Técnico' : 'Preço'}</p>
                        <p className="mt-1 text-sm font-bold text-foreground">{mega.pillars![k]}%</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trade Plan */}
                {plan && !plan.blocked && plan.approved && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Entrada', value: plan.entry!.toFixed(2) },
                      { label: `Stop (${plan.stopPct?.toFixed(2)}%)`, value: plan.stopLoss!.toFixed(2) },
                      { label: `Gain 1 (${plan.tp1Pct?.toFixed(2)}%)`, value: plan.tp1!.toFixed(2) },
                      { label: `Gain 2${plan.tp2Pct !== null && plan.tp2Pct !== undefined ? ` (${Number(plan.tp2Pct).toFixed(2)}%)` : ''}`, value: plan.tp2 !== null && plan.tp2 !== undefined ? Number(plan.tp2).toFixed(2) : '—' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2">
                        <div><p className="kicker">{row.label}</p><p className="mono text-sm font-semibold text-foreground">{row.value}</p></div>
                        <CopyBtn text={row.value} />
                      </div>
                    ))}
                  </div>
                )}

                <p className="rounded-xl bg-hover px-3 py-2 text-[12.5px] text-faint">ℹ️ Só aceitamos sinais com RR &gt; 1:{TRADING_MODES[modeId].rrMin.toFixed(1)} e Vol &gt; média. Sem filtro seria ~52%.</p>

                <a href={`https://www.tradingview.com/symbols/${tvSymbol.replace(':', '-')}/`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full">
                  Abrir Gráfico <ExternalLink className="size-4" />
                </a>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-faint">Carregando sinal…</div>
            )}
          </Panel>

          {/* Por que X%? */}
          {mega && mega.megaScore !== undefined && (
            <Panel title={`Por que ${mega.megaScore}%?`} sub="Detalhe expansível">
              <button type="button" onClick={() => setShowWhy(!showWhy)} className="w-full px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-hover">
                {showWhy ? 'Ocultar detalhes' : 'Mostrar detalhes'}
              </button>
              {showWhy && (
                <div className="border-t border-line space-y-2 p-4 text-sm text-muted-foreground">
                  <p>Social: {mega.pillars?.social}% {mega.socialUnavailable && '(indisponível, peso redistribuído)'} • Bullish avg: {mega.bullishAverage ?? '—'}%</p>
                  <p>Notícias: {mega.pillars?.news}% • Artigos: {(mega.newsArticles ?? []).length}</p>
                  <p>Técnico: {mega.pillars?.technical}% • RSI: {mega.rsi !== null && mega.rsi !== undefined ? Number(mega.rsi).toFixed(1) : '—'} • Padrões: {(mega.patterns ?? []).length ? mega.patterns!.map(p => p.name).join(', ') : 'nenhum'}</p>
                  <p>Preço: {mega.pillars?.price}% • Suporte: {mega.support?.toFixed(2) ?? '—'} • Resistência: {mega.resistance?.toFixed(2) ?? '—'} • ATR: {mega.atr?.toFixed(2) ?? '—'} • Vol ratio: {mega.volumeRatio?.toFixed(2) ?? '—'}</p>
                  {(mega.newsArticles ?? []).length > 0 && (
                    <ul className="list-disc pl-5">
                      {mega.newsArticles!.slice(0, 3).map((a, i) => <li key={i} className="truncate">{a.headline}</li>)}
                    </ul>
                  )}
                  <p className="text-[12px] text-faint">Não é recomendação financeira. Backtest 6m com filtro RR/Vol.</p>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* Notícias + Social */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Notícias" sub="Finnhub • classificadas por IA">
          <div className="p-3">
            {(mega?.newsArticles ?? []).length ? (
              <ul className="space-y-2">
                {mega!.newsArticles!.slice(0, 6).map((a, i) => (
                  <li key={i} className="rounded-xl border border-line px-3 py-2 text-sm text-foreground">{a.headline}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">Sem notícias para este símbolo.</p>
            )}
          </div>
        </Panel>
        <Panel title="Sentimento Social" sub="Adanos • Reddit/X/News/Polymarket">
          <div className="p-3 text-sm text-faint">
            {mega?.socialUnavailable ? 'Social indisponível — cálculo com News+Técnico+Preço.' : `Bullish avg: ${mega?.bullishAverage ?? '—'}% • Ver stock page para detalhes.`}
          </div>
        </Panel>
      </div>

      <p className="px-2 text-center text-[12px] text-faint">Não é recomendação financeira. Backtest 6m: win rate e RR dependem do ativo e do filtro. Este fork permanece AGPL-3.0 — se hospedar como serviço, publique o código fonte.</p>
    </div>
  );
}
