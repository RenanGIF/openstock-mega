import { NextRequest, NextResponse } from 'next/server';
import { getMegaSignal } from '@/lib/signals/mega-signal';
import { getTradePlan } from '@/lib/signals/tradePlan';
import { sendTelegramSignal } from '@/lib/notifications/telegram';
import { isValidTradingModeId } from '@/lib/signals/tradingModes';

// GET /api/mega/check?mode=scalp-acao&symbols=NVDA,AAPL
// Chamado pelo cron Inngest a cada 5min e pode ser chamado manualmente
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') || 'scalp-acao';
  const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'NVDA';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);

  if (!isValidTradingModeId(mode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 });
  }

  const results: unknown[] = [];
  for (const symbol of symbols) {
    try {
      const mega = await getMegaSignal(symbol, mode as 'scalp-acao' | 'scalp-crypto' | 'swing');
      if ('status' in mega && mega.status === 'market_closed') {
        results.push({ symbol, status: 'market_closed' });
        continue;
      }
      const m = mega as Exclude<typeof mega, { status: string }>;
      // Só envia Telegram se COMPRA/VENDA e aprovado
      if (m.signal === 'NEUTRO') {
        results.push({ symbol, megaScore: m.megaScore, signal: m.signal, status: 'neutral_no_alert' });
        continue;
      }
      const plan = getTradePlan(m as Parameters<typeof getTradePlan>[0]);
      if (plan.blocked) {
        results.push({ symbol, megaScore: m.megaScore, signal: m.signal, blocked: true, reason: plan.reason });
        continue;
      }
      // NOTIFICATION_CHANNEL
      const channel = (process.env.NOTIFICATION_CHANNEL || 'telegram').toLowerCase();
      if (channel === 'telegram' || channel === 'both') {
        const sent = await sendTelegramSignal(m as never, plan);
        results.push({ symbol, megaScore: m.megaScore, signal: m.signal, plan: { entry: plan.entry, stopLoss: plan.stopLoss, tp1: plan.tp1, rr: plan.rr }, telegram: sent });
      } else {
        results.push({ symbol, megaScore: m.megaScore, signal: m.signal, plan: { entry: plan.entry, stopLoss: plan.stopLoss, tp1: plan.tp1, rr: plan.rr }, telegram: { sent: false, reason: 'channel_not_telegram' } });
      }
    } catch (e) {
      results.push({ symbol, error: String(e).slice(0, 300) });
    }
  }

  return NextResponse.json({ mode, results, channel: process.env.NOTIFICATION_CHANNEL || 'telegram' }, { headers: { 'Cache-Control': 'no-store' } });
}
