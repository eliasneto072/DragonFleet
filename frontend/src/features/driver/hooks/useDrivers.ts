// Aqui você desacopla UI da API
import { useEffect, useState } from 'react';
import { getDrivers } from '../api/driver.api';

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDrivers()
      .then(setDrivers)
      .finally(() => setLoading(false));
  }, []);

  return { drivers, loading };
}