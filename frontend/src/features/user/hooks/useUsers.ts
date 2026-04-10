// src/features/user/hooks/useUsers.ts

import { useEffect, useState } from 'react';
import * as userApi from '../api/user.api';

export function useUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchUsers() {
    setLoading(true);
    try {
      const data = await userApi.getUsers();
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(user: any) {
    await userApi.createUser(user);
    await fetchUsers();
  }

  async function handleDelete(id: string) {
    await userApi.deleteUser(id);
    await fetchUsers();
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    loading,
    fetchUsers,
    handleCreate,
    handleDelete,
  };
}