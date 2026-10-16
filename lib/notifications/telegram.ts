// Telegram — Seção 9 do PROMPT MASTER + correção 3 (anti-spam cooldown)
import { getTradingMode, type TradingModeId } from '@/lib/signals/tradingModes';
import type { MegaSignal } from '@/lib/signals/mega-signal';
import type { TradePlan } from '@/lib/signals/tradePlan';
import { formatSymbolForTradingView } from '@/lib/utils';

const cooldownMap = new Map<string, number>(); // key: symbol:mode -> expiresAt ms

export function isCooldown(symbol: string, modeId: string): boolean {
  const key = `${symbol.toUpperCase()}:${modeId}`;
  const exp = cooldownMap.get(key);
  return exp !== undefined && Date.now() < exp;
}

export function setCooldown(symbol: string, modeId: string, minutes: number) {
  const key = `${symbol.toUpperCase()}:${modeId}`;
  cooldownMap.set(key, Date.now() + minutes * 60_000);
}

export function clearCooldown(symbol: string, modeId: string) {
  cooldownMap.delete(`${symbol.toUpperCase()}:${modeId}`);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*`\[\]]/g, '\\$&');
}

export async function sendTelegramSignal(
  mega: MegaSignal & { status: 'ok' },
  plan: TradePlan
): Promise<{ sent: boolean; reason?: string }> {
  const mode = getTradingMode(mega.mode as TradingModeId);
  if (isCooldown(mega.symbol, mega.mode)) {
    return { sent: false, reason: 'cooldown' };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: 'missing_env' };

  const tvSymbol = formatSymbolForTradingView(mega.symbol);
  const emoji = mega.signal === 'COMPRA' ? '🟢' : mega.signal === 'VENDA' ? '🔴' : '🟡';
  const patternNames = mega.patterns.map(p => p.name).join(', ') || 'nenhum';
  const text =
    `${emoji} *${escapeMarkdown(mega.symbol)} — ${escapeMarkdown(mega.signal)} ${mega.megaScore}%*\n` +
    `Entrada: ${plan.entry.toFixed(2)}\n` +
    `Stop: ${plan.stopLoss.toFixed(2)} (${plan.stopPct.toFixed(2)}%)\n` +
    `Gain 1: ${plan.tp1.toFixed(2)} (${plan.tp1Pct.toFixed(2)}%)` + (plan.tp2 ? ` | Gain 2: ${plan.tp2.toFixed(2)}` : '') + `\n` +
    `RR 1:${plan.rr.toFixed(2)} | Vol ${plan.volumeRatio !== null ? plan.volumeRatio.toFixed(2) : '—'}x ✅\n` +
    `Padrão: ${escapeMarkdown(patternNames)}\n` +
    `[Abrir Gráfico](https://www.tradingview.com/symbols/${tvSymbol.replace(':', '-')}/)`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[telegram] send failed', res.status, body.slice(0, 300));
      return { sent: false, reason: `telegram_${res.status}` };
    }
    setCooldown(mega.symbol, mega.mode, mode.cooldownMinutes);
    return { sent: true };
  } catch (e) {
    console.error('[telegram] error', e);
    return { sent: false, reason: 'fetch_error' };
  }
}
