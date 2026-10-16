# PROMPT MASTER — Agente de Código: Mega Sentimento + Trade Plan para OpenStock (Appzinho)
> **COLE ESTE PROMPT INTEIRO NO CHAT DO SEU AGENTE DE CÓDIGO (Cursor / Windsurf / Copilot / Antigravity / Codex) COM A PASTA DO `OpenStock` ABERTA NA IDE.**
> **O agente DEVE ler este documento + o histórico exportado antes de escrever qualquer linha de código.**
---
## 0) INSTRUÇÕES OBRIGATÓRIAS PARA O AGENTE (LEIA PRIMEIRO)
1.  **LEITURA OBRIGATÓRIA:** Você recebeu 2 documentos: (A) este `PROMPT MASTER` e (B) um `HISTORICO-DE-CONVERSA.md` (export do chat com o usuário). **Leia os dois INTEGRALMENTE antes de qualquer ação.**
2.  **RESUMO DE ENTENDIMENTO:** Antes de codar, envie ao usuário um resumo em PT-BR com:
    *   O que você entendeu do objetivo geral (em 5-8 bullets)
    *   Arquitetura que vai implementar (módulos + fluxo de dados)
    *   Lista dos 7 pontos de correção identificados na revisão
    *   Design System que vai seguir (dark + teal #47d9bb)
    *   Quais APIs/ENVs são obrigatórias e quais são opcionais
    *   **Aguardar confirmação explícita do usuário antes de começar a codar.**
3.  **PLANO DE EXECUÇÃO:** Após confirmação, crie um plano em formato checklist/todo com fases, estime ordem e dependências. Mantenha o usuário informado a cada fase concluída.
4.  **DÚVIDAS:** Se tiver QUALQUER dúvida (ambiguidade, falta de chave, escolha técnica, trade-off), **PERGUNTE ao usuário imediatamente**. Não assuma. Use `ask_user_question` / pergunta direta.
5.  **SKILLS:** Se precisar de skill (ex: manipular xlsx/docx, diagnosticar sandbox Windows, buscar skills), use `skill` tool. Para este projeto as skills relevantes são inspeção de repo, Node/TS, Tailwind/shadcn.
6.  **HISTÓRICO COMO FONTE DA VERDADE:** O `HISTORICO-DE-CONVERSA.md` contém decisões sobre pesos do Mega, padrões de candle, filtros RR/Volume, Telegram vs Email, ativos 15s, design reference. Em caso de conflito, priorize o PROMPT MASTER, mas cite o conflito e pergunte.
7.  **NÃO INVENTE:** Não adicione features fora deste escopo sem perguntar. Mantenha fidelidade ao escopo fechado.
---
## 1) OBJETIVO GERAL
Transformar o **OpenStock** (https://github.com/Open-Dev-Society/OpenStock | https://openstock-ods.vercel.app/) — um terminal open-source Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui + MongoDB + Finnhub + TradingView — em um **"appzinho" com MEGA SENTIMENTO + SINAL DE TRADE**.
O fork deve continuar sendo um terminal que **APENAS ANALISA E ALERTA**, nunca executa ordem. A execução é manual na corretora.
**Entregável final:** Uma nova rota/página ` /mega` (ou `/stocks/[symbol]` upgrade) chamada **MegaScreen**, com:
*   Seletor de modo de operação (SCALP AÇÃO, SCALP CRYPTO, SWING)
*   Barra de ativos filtrada por modo
*   Gráfico TradingView (5min para scalp) com padrão de candle destacado
*   Gauge MEGA 0-100 + explicação "Por que X%?"
*   Trade Plan: Entrada / Stop Loss / Gain 1 / Gain 2 / RR
*   Bloco de notícias + sentimento social
*   Filtro obrigatório: **Só envia alerta se RR > mínimo do modo E Volume > média 20 velas** + frase explicativa `Sem filtro seria ~52%`
*   Alerta via **Telegram (grátis, instantâneo)** com anti-spam + fallback Email opcional
*   Backtest para validar taxa ~58%
Design 100% fiel ao print de referência fornecido pelo usuário (dark #0a0a0a/#1f1e1a, cards rounded-xl, teal #47d9bb, tipografia grande bold).
---
## 2) CONTEXTO E DECISÕES JÁ TOMADAS (RESUMO DO HISTÓRICO)
*   **O que é sentimento hoje no OpenStock:** Não é técnico. É `StockSentimentCard` que consome Adanos API: 4 fontes (Reddit, X.com, News, Polymarket) retornando `buzzScore 0-100`, `bullishPct 0-100%`, `trend rising/falling/stable`, `metricValue (mentions/trades)`. Resumo `Avg buzz`, `Bullish avg`, `Coverage X/4`, `Source alignment` (Bullish/Bearish/Tight/Wide divergence/Mixed). Só aparece se `ADANOS_API_KEY` existir. Código em `lib/actions/adanos.actions.ts` + `adanos.helpers.ts` + `components/stocks/StockSentimentCard.tsx`.
*   **O que é técnico hoje:** Widgets TradingView `advanced-chart.js` (CANDLE_CHART_WIDGET_CONFIG interval D) + `technical-analysis.js` (interval 1h). São visuais, não geram número para código. `studies: []`.
*   **Mega Sentimento proposto:** Junta 4 pilares em nota 0-100. Pesos mudam por modo (ver seção 5).
*   **Padrões de candle:** Só os 6 mais confiáveis (validado por Bulkowski): `Engolfo Alta, Engolfo Baixa, Martelo, Estrela Cadente, Estrela da Manhã (3 velas), Estrela da Noite (3 velas)`. Cada um só validado se: `pavio correto + <1.5% de suporte/resistência + volume > média 20 + RSI não esticado + confirmação na vela seguinte`. Sem isso ignora.
*   **Timeframe:** SCALP AÇÃO = **5min** (não 15s/1min). Em 15s taxa cai pra 55%, em 5min com filtro vai pra ~65%.
*   **Ativos 15s GRÁTIS:** Só 2 grupos no Finnhub free (`hasFinnhubQuotes() == true`): (1) Ações US sem sufixo (`AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, NFLX, AMD, JPM, SPY, QQQ, DIA, IWM`, etc) e (2) Crypto Binance (`BINANCE:BTCUSDT`, `BINANCE:ETHUSDT`, etc). Cada chave Finnhub free = 60 req/min. `FINNHUB_API_KEYS=key1,key2,key3` = 180 req/min. Self-host com `NEXT_PUBLIC_OPENSTOCK_DATA_MODE=realtime` = 15s. Site público = 1h (cached). B3 (`PETR4.SA`) e Forex (`FX:USDJPY`) no free = 403, só TradingView delay (15min/end-of-day).
*   **Onde operar:** Ações US via `Avenue, Nomad, Inter Global, BTG USA, Interactive Brokers` (10:30-17:00 Brasília). Crypto via `Binance` (24/7). B3/Forex grátis só serve para swing com delay.
*   **Alerta:** Trocar Nodemailer (email) por **Telegram Bot** (100% grátis, <2s). WhatsApp grátis não existe de forma oficial. Manter Email como opcional.
*   **7 correções obrigatórias:** Ver seção 8.
*   **Licença:** AGPL-3.0 — se hospedar como serviço fechado e vender acesso, deve abrir código.
---
## 3) DESIGN SYSTEM — REFERÊNCIA OBRIGATÓRIA (PRINT)
O usuário enviou `screencapture-openstock-ods-vercel-app-2026-10-15-20_12_07.png`. Seguir fielmente:
*   **Fundo:** `bg-[#0a0a0a]` ou `bg-[#111]` | **Cards:** `bg-[#1f1e1a]` + `border border-white/[0.06]` + `rounded-xl` + `shadow`
*   **Cor destaque:** `teal #47d9bb` (oklch 0.80 0.13 176) — usada em botões `Get started free`, gauge, sparkline, `plotLineColorGrowing` em `lib/constants.ts`
*   **Texto:** Títulos `text-white font-bold text-3xl/tracking-tight`, subtítulos `text-muted-foreground / text-faint text-sm`, kicker `text-teal-400 text-xs uppercase tracking-widest`
*   **Layout:** Seções com kicker (`WHAT'S INSIDE`, `DATA`, `SELF-HOST`), grid 3 cols para cards, grid 2 cols para gráfico + gauge
*   **Componentes:** shadcn/ui + Radix + Tailwind v4 + lucide-react + next-themes (dark por padrão)
*   **Gráfico:** TradingView dark theme, `backgroundColor: '#1f1e1a'`, `gridColor: 'rgba(255,255,255,0.04)'`
A `MegaScreen` deve parecer nativa do OpenStock, não um app separado.
---
## 4) STACK E PASTA BASE
*   Fork de `https://github.com/Open-Dev-Society/OpenStock.git`
*   `Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Better Auth + Mongoose + Inngest + Nodemailer`
*   Instalação: `pnpm install` (ou npm). Node 20+.
*   Dependência nova única: `pnpm add technicalindicators` (para RSI, MACD, SMA, Bollinger, ATR, etc. cálculo local sem gastar API)
*   Estrutura existente relevante:
    *   `lib/constants.ts` (POPULAR_STOCKS, configs TradingView)
    *   `lib/markets.ts` (MARKETS, hasFinnhubQuotes, isMarketOpen)
    *   `lib/market-data.ts` (DATA_MODE, QUOTE_TTL_SECONDS)
    *   `lib/utils.ts` (formatSymbolForTradingView, CHART_BLOCKED_EXCHANGES, FINNHUB_TO_TRADINGVIEW_EXCHANGE)
    *   `lib/actions/finnhub.actions.ts` (getQuote, getLiveQuotes, getNews, searchStocks, fetchJSON com cache)
    *   `lib/actions/adanos.actions.ts` + `adanos.helpers.ts`
    *   `components/stocks/StockSentimentCard.tsx` + `app/(root)/stocks/[symbol]/page.tsx`
---
## 5) TRADING MODES — SELETOR "O QUE ESTOU OPERANDO?"
Criar `lib/signals/tradingModes.ts`:
```ts
export type TradingModeId = 'scalp-acao' | 'scalp-crypto' | 'swing';
export interface TradingMode {
  id: TradingModeId;
  label: string; // ex: "SCALP AÇÃO US ● LIVE 15s"
  description: string;
  weights: { social: number; news: number; technical: number; price: number }; // soma 1.0
  timeframe: '1m' | '5m' | '15m' | '1D'; // para candle
  atrMultiplierStop: number; // 1.5 para ação, 2.5 para crypto
  rrMin: number; // 1.5, 2.0, 2.5
  volumeMultiplierMin: number; // 1.0 = > média 20
  cooldownMinutes: number; // 30
  finnhubResolution: string; // "1" | "5" | "60" | "D" para /stock/candle
}
```
**Valores fechados (não inventar):**
| Modo | Label | Pesos (Social/News/Técnico/Preço) | TF | ATR Mult | RR Min | Vol Min | Cooldown | Ativos mostrados |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `scalp-acao` | SCALP AÇÃO US ● LIVE 15s | 15% / 15% / 45% / 25% | 5m | 1.5 | 1.5 | 1.0x média 20 | 30min | Só `hasFinnhubQuotes==true`: `SPY, QQQ, NVDA, AAPL, MSFT, JPM, DIA, IWM, etc` + `POPULAR_STOCKS` (bolinha verde LIVE) |
| `scalp-crypto` | SCALP CRYPTO ● 24/7 | 10% / 15% / 45% / 30% | 5m | 2.5 | 2.0 | 1.0x | 30min | Só `BINANCE:*`: `BTCUSDT, ETHUSDT, SOLUSDT` |
| `swing` | SWING (B3/Forex) | 30% / 25% / 25% / 20% | 1D | 1.5 | 2.5 | 1.0x | 60min | `PETR4.SA, VALE3.SA, ITUB4.SA, BMFBOVESPA:IBOV, FX:USDJPY, FX:EURUSD` com tag `DELAY 15min — grátis` e scalp desabilitado |
O seletor fica no topo da MegaScreen (pill/dropdown). Ao trocar, filtra a barra de ativos, muda pesos, recalcula gauge e bloqueia/liberia alerta.
---
## 6) CANDLE PATTERNS — SÓ 6, COM VALIDAÇÃO TRIPLA
Criar `lib/signals/candlePatterns.ts`:
*   Usar `technicalindicators` para helpers, mas detecção de padrão é manual (OHLCV).
*   **Permitidos:** `Bullish Engulfing, Bearish Engulfing, Hammer, Shooting Star, Morning Star, Evening Star`
*   **Proibidos:** Doji sozinho, Harami, Hanging Man sem confirmação, 3 White Soldiers — não implementar.
*   **Input:** `candles: { o,h,l,c,v, t }[]` (últimas 50 velas de `GET /stock/candle` ou fallback Yahoo)
*   **Validação obrigatória para considerar VÁLIDO (se falhar 1, ignora padrão):**
    1.  Forma: Hammer = `corpo < 30% range && pavio inferior > 2x corpo && pavio superior < 10% range`. Engolfo = `candle atual engole 100% corpo anterior`. Morning/Evening Star = 3 velas com gap.
    2.  Proximidade de S/R: `abs(close - nearestSupport/Resistance) / close < 0.015` (1.5%). S/R vem de `GET /scan/support-resistance` ou cálculo local de swing.
    3.  Volume: `volume_atual > SMA(volume, 20)` (1.0x). Para scalp-crypto exigir 1.2x.
    4.  RSI filtro: `30 < RSI(14) < 70` para reversão alta/baixa; se RSI >70 ou <30, padrão é ignorado (esticado).
    5.  Confirmação: próxima vela fecha acima (para alta) / abaixo (para baixa) do padrão. Se não houver próxima vela, marcar como `aguardando confirmação` e não contar ponto.
*   **Output:** `DetectedPattern { name, type: 'bullish'|'bearish', confidence: number, atIndex, supportLevel, volumeOk }`
*   **Pontuação:** Cada padrão válido = +15 pontos no pilar Técnico (cap 100). Sem padrão válido = 0.
*   **Para `scalp-acao` em 5m:** Priorizar os 4 comuns (Hammer, Shooting Star, Engolfos). Stars (3 velas) são raros mas valem 20 pontos quando aparecem.
---
## 7) MEGA SIGNAL + TRADE PLAN
### `lib/signals/mega-signal.ts`
**Função:** `getMegaSignal(symbol: string, mode: TradingModeId): Promise<MegaSignal>`
Passos:
1.  Resolver `mode` via `tradingModes.ts`.
2.  Trava `isMarketOpen(getMarketForSymbol(symbol))` — se fechado, retorna `{ status: 'market_closed' }` e não calcula.
3.  Buscar em paralelo (com cache `revalidate`):
    *   Social: `getStockSentimentInsights(symbol)` (Adanos) — se `null` ou `availableSources==0`, fallback: redistribuir pesos (ex: scalp-acao: News 20% + Técnico 55% + Preço 25%) e marcar `socialUnavailable: true`.
    *   Notícias: `getNews([symbol])` + classificar cada headline com Gemini (prompt: "Classifique como positivo/negativo/neutro para o ticker X, retorne JSON {sentiment, score}"). `newsScore = % positivas * 100`.
    *   Candles: `GET /stock/candle?symbol=SYM&resolution=5&from=&to=` (ou `60`/`D` conforme modo). Para Forex usar `GET /forex/candle?symbol=OANDA:USD_JPY`. Para B3/forex grátis se Finnhub der 403, fallback para Yahoo Finance `https://query1.finance.yahoo.com/v8/finance/chart/SYMBOL?interval=5m&range=5d` (sem chave, delay 15min). Calcular `RSI(14), MACD, SMA20/50, Bollinger, ATR(14), Volume SMA20`, chamar `candlePatterns.ts`.
    *   Preço/SR: `GET /scan/support-resistance?symbol=SYM` ou calcular S/R local. Calcular distância até suporte/resistência mais próximo.
4.  Normalizar cada pilar para 0-100:
    *   Social: `bullishAverage` (0-100)
    *   News: `newsScore`
    *   Técnico: `50 + padrões*15 + RSI/MACD bonus` (cap 100)
    *   Preço: `100 - (distancia_resistencia_penalidade)` — ex: <2% da resistência = 55, >5% = 85
5.  `megaScore = social*ws + news*wn + tech*wt + price*wp` (pesos do modo). Arredondar.
6.  `signal = megaScore >=70 ? 'COMPRA' : megaScore <=30 ? 'VENDA' : 'NEUTRO'` (venda espelhado).
7.  Retornar `{ symbol, mode, megaScore, signal, pillars: {social, news, technical, price}, patterns, newsArticles, support, resistance, atr, volumeRatio }`
### `lib/signals/tradePlan.ts`
**Função:** `getTradePlan(mega: MegaSignal): TradePlan | Blocked`
*   `entry = lastClose`
*   `stopLoss = entry - ATR*atrMultiplierStop` (para compra) ou `+` para venda. Também compara com `nearestSupport - 1%`; pega o mais conservador (mais próximo da entrada) para não ficar stop gigante.
*   `takeProfit1 = entry + (entry - stopLoss)*1.5` (ou *1.8 se RR exigido)
*   `takeProfit2 = nextResistance` ou `entry + (entry - stopLoss)*2.5`
*   `rr = (tp1 - entry)/(entry - stop)` 
*   `volumeRatio = volume_atual / SMA(volume,20)`
*   **Filtro bloqueante:** Se `rr < mode.rrMin` OU `volumeRatio < mode.volumeMultiplierMin`, retorna `{ blocked: true, reason: 'RR 1:1.2 < mínimo 1:1.5' | 'Volume 0.8x < média', estimatedWinRateWithoutFilter: '52%', withFilter: '58%' }` e **NÃO deve disparar alerta**.
*   Caso passe: `{ entry, stopLoss, stopPct, tp1, tp1Pct, tp2, tp2Pct, rr, volumeRatio, approved: true }`
*   Mensagem para UI: `"Só aceitamos sinais com RR > 1:1.5 e Vol > média. Sem filtro seria ~52%."`
---
## 8) AS 7 CORREÇÕES OBRIGATÓRIAS (NÃO PULAR)
1.  **Taxa 58% sem prova:** Criar `lib/signals/backtest.ts` com `runBacktest(symbol, mode, from, to)` que reexecuta `getMegaSignal` em candles históricos e conta `win = tp1 atingido antes do stop` (usando high/low). Retornar `{ totalTrades, wins, winRate, avgRR, profitFactor }`. Exibir disclaimer: `"Taxa estimada com filtro (backtest 6m) — não é recomendação financeira. Expectativa = winRate*RR - (1-winRate)"`.
2.  **Fonte Volume/ATR:** Sempre de `GET /stock/candle` (ou Yahoo fallback) — nunca do widget TradingView. Média 20 velas do TF do modo.
3.  **Anti-spam Telegram:** Em `lib/notifications/telegram.ts`, implementar `cooldown` por `symbol` (30min scalp, 60min swing) usando `Map` + persistência leve (Mongo ou memória). Se bloquear, logar e não enviar. Bot limit 20 msg/s.
4.  **Mercado fechado:** Checar `isMarketOpen(market)` antes de calcular/enviar. Para `fx` usar regra `24/5` de `lib/markets.ts`. Fora do horário, retornar `market_closed` e UI mostra "Mercado fechado".
5.  **B3/Forex grátis = DELAY:** Se `!hasFinnhubQuotes(symbol)`, UI deve exibir tag `DELAY 15min — só Swing` e desabilitar botão de scalp / alerta 15s. Documentar que para 15s neles precisa Finnhub Premium $59/m.
6.  **Fallback Adanos null:** Se `getStockSentimentInsights` retornar null, não quebrar. Redistribuir pesos e exibir `Social indisponível — cálculo com News+Técnico+Preço`.
7.  **Licença AGPL-3.0:** Adicionar aviso no README da MegaScreen: `Este fork permanece AGPL-3.0. Se hospedar como serviço, publique o código fonte.`
---
## 9) NOTIFICAÇÃO — TELEGRAM (PRINCIPAL) + EMAIL OPCIONAL
### `lib/notifications/telegram.ts`
```ts
export async function sendTelegramSignal(plan: MegaSignal & TradePlan) {
  if (isCooldown(symbol)) return;
  const text = `*${symbol} — ${plan.signal} ${plan.megaScore}%*\n` +
  `Entrada: ${plan.entry}\nStop: ${plan.stopLoss} (${plan.stopPct}%)\nGain 1: ${plan.tp1} (${plan.tp1Pct}%) | Gain 2: ${plan.tp2}\nRR 1:${plan.rr} | Vol ${plan.volumeRatio}x ✅\n` +
  `Padrão: ${plan.patterns.map(p=>p.name).join(', ') || 'nenhum'}\n` +
  `[Abrir Gráfico](https://www.tradingview.com/symbols/${tvSymbol})`;
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode:'Markdown' })
  });
  setCooldown(symbol, mode.cooldownMinutes);
}
```
*   ENV: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (obtido via @BotFather + `getUpdates`)
*   Manter `Nodemailer` como fallback opcional controlado por `NOTIFICATION_CHANNEL=telegram|email|both`
*   Integrar com `Inngest` cron a cada 5min (scalp) ou 15min (swing) — reutilizar `lib/inngest`
---
## 10) UI — MEGASCREEN (TELINHA ARRUMADA)
Criar `components/stocks/MegaScreen.tsx` + rota `app/(root)/mega/page.tsx` (ou upgrade de `stocks/[symbol]/page.tsx`):
**Layout (dark/teal, fiel ao print):**
```
[HEADER: Pill "Você opera: ▼ SCALP AÇÃO US ● LIVE 15s" (dropdown tradingModes) + badge AGPL]
[BARRA DE ATIVOS: grid flex wrap, cada ativo é <button> com dot verde LIVE ou tag DELAY. Clique carrega símbolo]
[GRID 2 colunas: ESQ = TradingViewWidget (advanced-chart.js) com height 560, allowExpand, config CANDLE_CHART_WIDGET_CONFIG(tvSymbol) mas com interval do modo (5m). Sobrepor marcador SVG no candle do padrão detectado. DIR = Card MEGA]
  Card MEGA:
    - Gauge circular ou barra 0-100 com cor teal (#47d9bb) se >=70, amarelo se 40-70, vermelho se <=30
    - Texto grande "74% ●●●●○ COMPRA" + badges "RR 1:1.8 ✅ | Vol 1.4x ✅" ou "BLOQUEADO RR<1.5"
    - Barra segmentada: Social | News | Técnico | Preço (cada com %)
    - Grid Entrada / Stop / Gain1 / Gain2 copiável
    - Frase fixa: "Só aceitamos sinais com RR>1:1.5 e Vol>média. Sem filtro seria ~52%."
[EXPANSÍVEL "POR QUE 74%?": lista padrões validados ✅ Volume 1.6x ✅ RSI 58 ✅ Perto suporte, lista notícias classificadas, lista social buzz]
[GRID 2 colunas: Notícias (Finnhub) + Sentimento Social (Adanos)]
[FOOTER disclaimer: "Não é recomendação financeira. Backtest 6m: 57.8% win rate, RR médio 1.6, PF 1.4"]
```
*   Usar `Panel` existente (`components/Panel.tsx`) para consistência.
*   Estado do modo em `localStorage` + `searchParams`.
*   Loading com `Suspense` igual a `StockDetails` page.
*   Se `blocked` ou `market_closed`, mostrar card amarelo/cinza explicando motivo e não enviar Telegram.
---
## 11) ENV E APIS — TUTORIAL COMPLETO
**Arquivo `.env` modelo (criar `.env.example`):**
```env
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxx.mongodb.net/openstock?retryWrites=true&w=majority
# ou local: mongodb://root:example@mongodb:27017/openstock?authSource=admin
BETTER_AUTH_SECRET=gere_string_32_chars_aleatoria
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_FINNHUB_API_KEY=key1_gratis
FINNHUB_API_KEYS=key1_gratis,key2_gratis
FINNHUB_BASE_URL=https://finnhub.io/api/v1
NEXT_PUBLIC_OPENSTOCK_DATA_MODE=realtime
GEMINI_API_KEY=AIzaSy...
ADANOS_API_KEY=opcional_ou_vazio
ADANOS_API_BASE_URL=https://api.adanos.org
INNGEST_EVENT_KEY=xxx
INNGEST_SIGNING_KEY=signkey-xxx
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=987654321
NOTIFICATION_CHANNEL=telegram
# Email opcional
# NODEMAILER_EMAIL=seu@gmail.com
# NODEMAILER_PASSWORD=abcd efgh ijkl mnop
```
**Como pegar cada chave (2-3 min cada):**
1.  **Finnhub:** https://finnhub.io/register → Dashboard https://finnhub.io/dashboard → copie API Key. Crie 2 contas para 2 keys.
2.  **Gemini:** https://aistudio.google.com/app/apikey → Create API Key
3.  **MongoDB Atlas:** https://cloud.mongodb.com/ → Create Cluster M0 Free → Database Access (user) → Network Access (0.0.0.0/0) → Connect → Drivers → URI
4.  **Adanos (opcional):** https://api.adanos.org
5.  **Gmail App Password:** https://myaccount.google.com/apppasswords (requer 2FA em https://myaccount.google.com/signinoptions/two-step-verification)
6.  **Telegram:** Telegram → @BotFather → /newbot → copie TOKEN → mande "Oi" ao bot → abra `https://api.telegram.org/bot<TOKEN>/getUpdates` → pegue `chat.id`
7.  **Inngest (opcional):** https://app.inngest.com/ → Keys
---
## 12) TAREFAS — PLANO QUE O AGENTE DEVE GERAR E EXECUTAR
Após resumo e confirmação, o agente deve executar nesta ordem:
**Fase 1 — Setup**
- [ ] Clonar/verificar OpenStock, `pnpm install`, criar `.env.example`, `pnpm add technicalindicators`, validar `pnpm test:db` e `pnpm dev`
- [ ] Auditar `lib/markets.ts`, `lib/utils.ts`, `lib/actions/finnhub.actions.ts` para entender `hasFinnhubQuotes`, `isMarketOpen`, `fetchJSON`
**Fase 2 — Core Signals**
- [ ] Criar `lib/signals/tradingModes.ts`
- [ ] Criar `lib/signals/candlePatterns.ts` (só 6 padrões + validações)
- [ ] Criar `lib/signals/mega-signal.ts` (com fallback Adanos/Yahoo e trava isMarketOpen)
- [ ] Criar `lib/signals/tradePlan.ts` (ATR, RR, volume filter)
- [ ] Criar `lib/signals/backtest.ts`
**Fase 3 — Notificação**
- [ ] Criar `lib/notifications/telegram.ts` (anti-spam + cooldown)
- [ ] Integrar cron Inngest (ou endpoint `api/mega/check`) para disparo periódico
**Fase 4 — UI**
- [ ] Criar `components/stocks/MegaScreen.tsx` + `MEGA_GAUGE` + `PatternMarker`
- [ ] Criar rota `app/(root)/mega/page.tsx`
- [ ] Adicionar mercado `BR` opcional em `lib/markets.ts` (se usuário pedir B3)
- [ ] Garantir design 100% dark/teal fiel ao print + responsivo
**Fase 5 — Validação**
- [ ] Rodar `pnpm build` sem erros TS
- [ ] Testar manualmente com `NVDA` (scalp-acao 5m) e `BINANCE:BTCUSDT` (scalp-crypto)
- [ ] Rodar backtest 6m e exibir taxa real
- [ ] Testar Telegram com 1 alerta real e verificar cooldown
---
## 13) CRITÉRIOS DE ACEITE
*   `NVDA` em modo `SCALP AÇÃO` exibe gauge, stop/gain e só envia Telegram se `RR>=1.5` e `Vol>=1.0x`, senão mostra `BLOQUEADO` com motivo.
*   Gráfico 5min mostra marcador no candle do padrão válido (Hammer/Engolfo).
*   Trocar para `SCALP CRYPTO` filtra ativos para `BINANCE:*` e exige `RR>=2.0`.
*   `PETR4.SA` mostra tag `DELAY 15min` e não permite alerta 15s.
*   Mercado fechado não gera sinal falso.
*   Sem `ADANOS_API_KEY`, Mega continua funcionando com pesos redistribuídos.
*   `pnpm build` passa, `technicalindicators` importado corretamente.
*   README atualizado com seção `Mega Sentimento` + aviso AGPL.
---
## 14) PERGUNTAS QUE O AGENTE DEVE FAZER SE TIVER DÚVIDA
*   Qual modo deve ser default ao abrir `/mega`? (sugerido: `scalp-acao`)
*   Quais ativos iniciais na barra? (sugerido: `SPY, QQQ, NVDA, AAPL, MSFT` para acao; `BTCUSDT, ETHUSDT` para crypto)
*   Quer que eu adicione mercado `BR` (`id: 'br'`, `BMFBOVESPA:IBOV`, `PETR4.SA` etc) em `lib/markets.ts`?
*   Telegram ou Email como padrão? (sugerido: Telegram)
*   Onde hospedar? Vercel ou Docker local?
---
**FIM DO PROMPT MASTER — AGUARDE O RESUMO DO AGENTE E CONFIRME ANTES DELE CODAR.**