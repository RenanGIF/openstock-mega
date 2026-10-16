import { Suspense } from 'react';
import MegaScreen from '@/components/stocks/MegaScreen';

export default function MegaPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-faint">Carregando Mega…</div>}>
      <MegaScreen />
    </Suspense>
  );
}
