import { useState } from 'react';
import * as authApi from '../api/auth.api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(email: string, password: string) {
    setLoading(true);

    try {
      const data = await authApi.login(email, password);

      localStorage.setItem('token', data.token);

      const me = await authApi.getMe();
      setUser(me);

      return me;
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await authApi.logout();
    localStorage.removeItem('token');
    setUser(null);
  }

  return {
    user,
    loading,
    handleLogin,
    handleLogout,
  };
}