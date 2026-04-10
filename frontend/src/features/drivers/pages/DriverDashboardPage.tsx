// src/features/driver/pages/DriverDashboardPage.tsx

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { DriverDashboard } from '@/app/components/driver/driver-dashboard';
import { mockDrivers } from '@/shared/lib/mock-data';

export default function DriverDashboardPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  // Enquanto a sessão está sendo restaurada (verificando token salvo),
  // não renderiza nada para evitar flash de conteúdo ou redirect indevido
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }

  // Sem sessão ativa → manda para o login
  if (!isAuthenticated) {
    navigate('/login', { replace: true });
    return null;
  }

  // Por ora o DriverDashboard ainda espera o shape completo do mock (rating,
  // totalEarnings, etc.) que a API ainda não retorna. Fazemos um merge:
  // dados reais do AuthContext sobrescrevem o mock de mesmo id (ou [0]).
  const mockDriver = mockDrivers.find((d) => d.id === user!.id) ?? mockDrivers[0];
  const driver = {
    ...mockDriver,
    id:    user!.id,
    name:  user!.name,
    email: user!.email,
    role:  user!.role,
  };

  return <DriverDashboard driver={driver} />;
}