import { NextRequest, NextResponse } from 'next/server';
import { getMegaSignal } from '@/lib/signals/mega-signal';
import { getTradePlan } from '@/lib/signals/tradePlan';
import { isValidTradingModeId } from '@/lib/signals/tradingModes';

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') || 'NVDA').toUpperCase();
  const mode = (req.nextUrl.searchParams.get('mode') || 'scalp-acao') as string;

  if (!isValidTradingModeId(mode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 });
  }

  try {
    const mega = await getMegaSignal(symbol, mode as never);
    if ('status' in mega && mega.status === 'market_closed') {
      return NextResponse.json({ mega, plan: null, symbol, mode }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const m = mega as Exclude<typeof mega, { status: string }>;
    const plan = getTradePlan(m as never);
    return NextResponse.json({ mega: m, plan, symbol, mode }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[mega/signal] error', e);
    return NextResponse.json({ error: String(e).slice(0, 500) }, { status: 500 });
  }
}
