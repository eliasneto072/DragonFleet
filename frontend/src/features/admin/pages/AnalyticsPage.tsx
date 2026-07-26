import { AnalyticsDashboard } from '@/app/components/admin/analytics-dashboard';
import { ExportReport } from '@/app/components/admin/export-report';

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <ExportReport />
      <AnalyticsDashboard />
    </div>
  );
}
