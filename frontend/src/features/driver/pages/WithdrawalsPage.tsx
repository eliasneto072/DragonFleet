import { Withdrawals } from '@/app/components/driver/withdrawals';
import { mockDrivers } from '@/shared/lib/mock-data';

const CURRENT_DRIVER = mockDrivers[0];

export default function WithdrawalsPage() {
  return <Withdrawals driverId={CURRENT_DRIVER.id} />;
}