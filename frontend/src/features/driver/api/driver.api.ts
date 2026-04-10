// src/features/driver/api/driver.api.ts
import { http } from '@/shared/api/http';

export async function getDrivers() {
  const { data } = await http.get('/drivers');
  return data;
}

export async function getDriverById(id: string) {
  const { data } = await http.get(`/drivers/${id}`);
  return data;
}