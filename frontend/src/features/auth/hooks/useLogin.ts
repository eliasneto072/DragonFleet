// src/features/auth/hooks/useLogin.ts

import { useState } from 'react';
import { login } from '../api/auth.api';

export function useLogin() {
  const [loading, setLoading] = useState(false);

  async function handleLogin(email: string, password: string) {
    setLoading(true);

    try {
      const data = await login(email, password);

      localStorage.setItem('token', data.token);

      return data;
    } finally {
      setLoading(false);
    }
  }

  return { handleLogin, loading };
}