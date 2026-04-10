import { DocumentsManagement } from '@/app/components/driver/documents-management';
import { mockDrivers } from '@/shared/lib/mock-data';

const CURRENT_DRIVER = mockDrivers[0];

export default function DocumentsPage() {
  return <DocumentsManagement driverId={CURRENT_DRIVER.id} />;
}