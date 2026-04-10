// src/features/driver/ui/DriversList.tsx
import { useDrivers } from '../hooks/useDrivers';

export function DriversList() {
  const { drivers, loading } = useDrivers();

  if (loading) return <p>Carregando...</p>;

  return (
    <ul>
      {drivers.map((driver: any) => (
        <li key={driver.id}>{driver.name}</li>
      ))}
    </ul>
  );
}