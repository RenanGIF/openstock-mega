# HISTÓRICO DE CONVERSA — ANEXO OBRIGATÓRIO PARA O AGENTE
# Cole este arquivo junto com o PROMPT MASTER na IDE
# O agente DEVE ler este histórico integralmente antes de codar
> Export resumido e fiel da conversa usuário ↔ assistente que originou o PROMPT MASTER.
> Contém decisões sobre sentimento, Mega, padrões, ativos 15s, design e correções.
---
## 1) O que é o OpenStock (descoberto na análise do repo)
- Open-source alternativo a Bloomberg, 20.3K stars, AGPL-3.0, Next.js 15 + TS + Tailwind v4 + shadcn/ui + MongoDB + Finnhub + TradingView widgets.
- Modos: Community (free, 1h quotes), Cloud ($5/m, 15s - coming soon), Self-host (free, 15s com suas Finnhub keys).
- Features: auth Better Auth, search ⌘K (Finnhub), watchlist por usuário, stock details com TradingView (candles, technicals, financials, profile), sentiment via Adanos (Reddit/X/news/Polymarket), heatmap/movers, onboarding, email via Nodemailer+Inngest+Gemini (welcome + Monday digest).
- Env: FINNHUB_API_KEYS (pool, cada 60 req/min), NEXT_PUBLIC_OPENSTOCK_DATA_MODE=realtime/cached, MONGODB_URI, GEMINI_API_KEY, ADANOS_API_KEY, INNGEST_*, NODEMAILER_*.
## 2) Sentimento atual — NÃO é técnico
- Card `Sentiment` em `stocks/[symbol]/page.tsx` só aparece se ADANOS_API_KEY existir.
- 4 chamadas Adanos: /reddit/stocks/v1/compare, /x/..., /news/..., /polymarket/... com `tickers` + `days` (7 default, max 30), header X-API-Key, revalidate 300.
- Cada fonte: buzz_score 0-100, bullish_pct 0-100%, trend rising/falling/stable, metricValue mentions/trades.
- Resumo: Avg buzz, Bullish avg, Coverage X/4, Source alignment (Bullish alignment se spread<=12 e avg>=60, Bearish se <=40, Tight se <=12, Wide divergence se >=25, Mixed).
- Técnico fica separado: Chart advanced-chart.js interval D (studies: []) e Technicals technical-analysis.js interval 1h — visuais, não geram score.
## 3) Mega Sentimento — arquitetura acordada
```
MEGA_SCORE 0-100
  30% Social (Adanos buzz/bullish)
  25% Notícias (Finnhub /company-news + Gemini classificação positivo/negativo)
  25% Técnico (candle patterns + RSI/MACD/Bollinger via technicalindicators, calculo local de candles Finnhub /stock/candle)
  20% Preço/Limites (S/R via /scan/support-resistance, ATR, distância até resistência, 52w high/low)
  → Gemini escreve veredito "Por que X%?"
```
- Pesos são defaults para SWING; para SCALP mudam (ver tradingModes).
- Custo: 1 req candle a cada 15min por símbolo (cache 300s), cálculo local.
## 4) Alerta 70% + Stop/Gain — Trade Plan
- Confiança = confluência, não probabilidade estatística. Ex: 72% = 30% social + 25% news + 25% técnico + 20% preço.
- Limiar: >=70 COMPRA, <=30 VENDA, senão NEUTRO.
- Entrada = preço atual.
- Stop = mais conservador entre ATR(14)*1.5 abaixo e suporte-1% (ou mínima do padrão).
- TP1 = +1.5x risco, TP2 = próxima resistência.
- Só dispara se RR > mínimo do modo e volume > média, senão bloqueia.
- Mensagem Telegram: 🟢 SYMBOL XX% COMPRA | Entrada | Stop (-X%) | Gain1 (+X%) | Gain2 | RR 1:1.8 | Padrão validado.
## 5) USD/JPY e Ibovespa — suporte atual
- lib/markets.ts já tem `fx` (FX:EURUSD, GBPUSD, USDJPY, AUDUSD) feed Live, hours 24/5. hasFinnhubQuotes retorna FALSE para tudo com ":" → sem quote Finnhub, só widget TradingView live.
- B3 não está em MARKETS, mas FINNHUB_TO_TRADINGVIEW_EXCHANGE tem '.SA'→'BMFBOVESPA', e CHART_BLOCKED_EXCHANGES não contém BMFBOVESPA → chart funciona. Finnhub free dá 403 para .SA (US+crypto only). MARKET_SUPPORT.md confirma.
- Para Mega em Forex/B3 no free: trocar /stock/candle por /forex/candle ou fallback Yahoo Finance (delay 15min, sem chave). Adanos para FX/B3 quase sempre null.
- Recomendação: não fazer scalp 15s em B3/Forex no free; usar modo SWING 1D com delay.
## 6) APIs grátis e atualização
- Finnhub free 60 req/min por key, comunidade 1h, self-host realtime 15s (mesmo grátis). 3 keys = 180 req/min. TradingView widgets sempre live para US/crypto/forex. Adanos free revalidate 300s, Gemini 60 req/min free, Mongo 512MB free, Inngest 500 runs/m free, Telegram ilimitado grátis.
- Para Forex/B3 grátis fallback Yahoo → 15min delay.
## 7) Ativos com 15s GRÁTIS (hasFinnhubQuotes==true)
- Ações US sem sufixo: SPY, QQQ, DIA, IWM, AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, NFLX, AMD, JPM, BAC, WFC, GS, V, MA, etc. Qualquer ticker US puro.
- Crypto: BINANCE:BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, AVAXUSDT, LINKUSDT, DOTUSDT.
- NÃO tem 15s: FX:USDJPY, PETR4.SA, BSE:*, XETR:*, LSE:*, etc (tag DELAY).
## 8) Onde negociar (corretora)
- OpenStock não é corretora. Execução manual.
- Ações US: Avenue, Nomad, Inter Global, BTG USA, XP Internacional (zero corretagem), Interactive Brokers (profissional).
- Crypto: Binance, Coinbase, etc (24/7).
## 9) Scalp Ação vs Crypto — confiabilidade com Mega
- Ação US mais confiável (social/news bem cobertos, volume real, SR respeitado, ATR estável). Com filtro RR>1:1.5 e Vol>média, taxa sobe de ~52% para ~58% (Bulkowski).
- Crypto mais volátil, social ruidoso, precisa ATR*2.5 e RR>1:2.0, TF 5min.
- Recomendação: começar por SCALP AÇÃO (SPY/QQQ/NVDA/AAPL) 10:30-17:00 BR; crypto 24/7 depois.
## 10) Trading Modes acordados
- SCALP AÇÃO: pesos 15/15/45/25, TF 5m, ATR 1.5, RR>=1.5, Vol>1.0x
- SCALP CRYPTO: pesos 10/15/45/30, TF 5m, ATR 2.5, RR>=2.0, Vol>1.0x
- SWING: pesos 30/25/25/20, TF 1D, ATR 1.5, RR>=2.5
- Seletor no topo da MegaScreen filtra ativos e recalcula.
## 11) Padrões — só 6, correção exigida
- Permitidos: Engolfo Alta, Engolfo Baixa, Martelo, Estrela Cadente, Estrela da Manhã (3 velas), Estrela da Noite (3 velas).
- Cada um só válido se: pavio correto + <1.5% de S/R + volume > SMA20 + RSI não esticado (30-70) + confirmação próxima vela. Sem isso ignora.
- TF scalp = 5min (não 15s/1min). Proibidos: Doji sozinho, Harami etc (50-53%).
- Mensagem UI: padrão validado ✅ Volume 1.6x ✅ etc; se sem volume não envia.
## 12) Telinha arrumada — MegaScreen
- Layout: [Seletor modo] + [Barra ativos LIVE/DELAY] + [Grid 2col: Gráfico 5min com marcador no padrão | Gauge 74% + RR/Vol + Stop/Gain copiável + frase filtro] + [Expansível Por que 74%?] + [Notícias | Sentimento].
- Filtro bloqueante visível: "Só aceitamos RR>1:1.5 e Vol>média. Sem filtro seria ~52%." Se bloqueado, card amarelo com motivo.
- Botões copiáveis Entrada/Stop/Gain, link Abrir Gráfico.
## 13) Telegram vs Email
- Telegram 100% grátis (<2s), via BotFather + getUpdates para chat_id, fetch api.telegram.org. WhatsApp oficial pago, gambiarra CallMeBot limitada. Email via Nodemailer cai no spam. Recomendado Telegram (ou both), com cooldown 30min por símbolo.
## 14) 7 furos encontrados na revisão
1. Taxa 58% sem backtest → criar lib/backtest.ts + disclaimer.
2. Fonte Volume/ATR indefinida → usar /stock/candle (SMA20).
3. Spam Telegram → cooldown 30min + mute.
4. Mercado fechado → checar isMarketOpen, só calcular em horário.
5. B3/Forex 15s falso → tag DELAY 15min, desabilitar scalp.
6. Adanos null → redistribuir pesos, avisar.
7. Licença AGPL-3.0 → aviso se hospedar como serviço.
## 15) Estado final acordado
- Usuário vai exportar histórico e colar com PROMPT MASTER na IDE.
- Agente deve: ler ambos, resumir entendimento e enviar para conferir, criar plano checklist, perguntar dúvidas, usar skills se preciso, executar por fases sem inventar features.
---
# FIM DO HISTÓRICO — AGENTE DEVE CITAR ESTE DOCUMENTO NO RESUMO