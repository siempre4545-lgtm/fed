import { Suspense } from 'react';
import FedDashboardClient from './FedDashboardClient';

export default function FedDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white p-6"><div className="text-sm opacity-70">Loading…</div></div>}>
      <FedDashboardClient />
    </Suspense>
  );
}
