import { DriverDashboard } from '@/app/components/driver/driver-dashboard';
import { mockWithdrawals, mockEarnings, mockDrivers } from "@/shared/lib/mock-data";

const CURRENT_DRIVER = mockDrivers[0];

export default function DriverDashboardPage() {
  return <DriverDashboard driver={CURRENT_DRIVER} />;
}