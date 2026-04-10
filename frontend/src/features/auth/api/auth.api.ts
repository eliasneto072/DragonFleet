// src/features/auth/api/auth.api.ts

import { http } from '@/shared/api/http';

export async function login(email: string, password: string) {
  const { data } = await http.post('/auth/login', {
    email,
    password,
  });

  return data;
}

export async function logout() {
  const { data } = await http.post('/auth/logout');
  return data;
}

export async function getMe() {
  const { data } = await http.get('/auth/me');
  return data;
}