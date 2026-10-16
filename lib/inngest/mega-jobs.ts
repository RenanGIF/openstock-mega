// Cron MEGA — dispara a cada 5 min (verifica cada modo) e chama /api/mega/check internamente
import { inngest } from '@/lib/inngest/client';

export const checkMegaSignals = inngest.createFunction(
  { id: 'check-mega-signals', concurrency: 1, triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    const baseUrl = process.env.BETTER_AUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const symbolsByMode: Record<string, string[]> = {
      'scalp-acao': ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT'],
      'scalp-crypto': ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'],
    };

    for (const [mode, symbols] of Object.entries(symbolsByMode)) {
      await step.run(`check-${mode}`, async () => {
        try {
          const qs = new URLSearchParams({ mode, symbols: symbols.join(',') }).toString();
          const res = await fetch(`${baseUrl}/api/mega/check?${qs}`, { signal: AbortSignal.timeout(15000) });
          const data = await res.json().catch(() => ({}));
          console.log(`[mega cron] ${mode}:`, data);
          return data;
        } catch (e) {
          console.error(`[mega cron] ${mode} failed`, e);
          return { error: String(e) };
        }
      });
    }
    return { ok: true };
  }
);
