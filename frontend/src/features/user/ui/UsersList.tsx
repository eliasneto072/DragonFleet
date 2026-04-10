// src/features/user/ui/UsersList.tsx

import { useUsers } from '../hooks/useUsers';

export function UsersList() {
  const { users, loading, handleDelete } = useUsers();

  if (loading) return <p>Carregando...</p>;

  return (
    <ul>
      {users.map((user: any) => (
        <li key={user.id}>
          {user.name}
          <button onClick={() => handleDelete(user.id)}>
            Deletar
          </button>
        </li>
      ))}
    </ul>
  );
}