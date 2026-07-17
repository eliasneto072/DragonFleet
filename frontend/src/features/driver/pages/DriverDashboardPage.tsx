// src/features/driver/pages/DriverDashboardPage.tsx

import { DriverDashboard } from '@/app/components/driver/driver-dashboard';
import { ImportEarnings } from '@/app/components/driver/import-earnings';

export default function DriverDashboardPage() {
  return (
    <div className="space-y-6">
      <DriverDashboard />
      <ImportEarnings />
    </div>
  );
}