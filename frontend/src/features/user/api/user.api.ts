import { http } from '@/shared/api/http';

export async function getUsers() {
  const { data } = await http.get('/users');
  return data;
}

export async function getUserById(id: string) {
  const { data } = await http.get(`/users/${id}`);
  return data;
}

export async function createUser(payload: any) {
  const { data } = await http.post('/users', payload);
  return data;
}

export async function updateUser(id: string, payload: any) {
  const { data } = await http.put(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id: string) {
  const { data } = await http.delete(`/users/${id}`);
  return data;
}