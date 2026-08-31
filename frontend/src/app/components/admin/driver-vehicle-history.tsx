// src/app/components/admin/driver-vehicle-history.tsx
//
// Que carros este motorista conduziu, e quando.
//
// É o inverso do histórico que já existe na ficha do veículo: lá a pergunta é
// "que motoristas passaram por este carro"; aqui é "que carros esta pessoa
// conduziu". Mesma tabela, outro ângulo — e quem investiga uma ocorrência
// costuma partir da pessoa, não da matrícula.
//
// A atribuição aberta (sem endedAt) aparece destacada como atual.

import { useQuery } from '@tanstack/react-query';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Car, History } from 'lucide-react';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiDriverAssignment } from '@/shared/types/api';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT');
}

/** Duração em dias inteiros; para a atribuição aberta conta até hoje. */
function durationDays(a: ApiDriverAssignment): number {
  const end = a.endedAt ? new Date(a.endedAt).getTime() : Date.now();
  return Math.max(1, Math.round((end - new Date(a.startedAt).getTime()) / 86_400_000));
}

function durationLabel(days: number): string {
  if (days < 31) return `${days} dia${days !== 1 ? 's' : ''}`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
}

interface Props {
  userId: string;
}

export function DriverVehicleHistory({ userId }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.vehicles.all, 'driver-history', userId] as const,
    queryFn: () => vehiclesService.driverVehicleHistory(userId),
    enabled: !!userId,
  });

  const history = data?.history ?? [];
  const current = history.find((a) => !a.endedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" aria-hidden="true" />
          Histórico de veículos
        </CardTitle>
        <CardDescription>
          {current
            ? `Conduz atualmente ${current.vehicle?.plate ?? 'um veículo'}`
            : `${history.length} atribuição${history.length !== 1 ? 'ões' : ''} no histórico`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-start gap-2 py-4">
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o histórico.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : history.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Este motorista nunca teve um veículo atribuído.
          </p>
        ) : (
          <ul>
            {history.map((a) => {
              const open = !a.endedAt;
              const days = durationDays(a);
              return (
                <li key={a.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      open
                        ? 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                    aria-hidden="true"
                  >
                    <Car className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {a.vehicle
                          ? `${a.vehicle.brand} ${a.vehicle.model}`
                          : 'Veículo removido'}
                      </p>
                      {a.vehicle && (
                        <span className="font-mono text-xs tracking-tight text-muted-foreground">
                          {a.vehicle.plate}
                        </span>
                      )}
                      {open && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Atual
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Desde {fmtDate(a.startedAt)}
                      {a.endedAt ? ` até ${fmtDate(a.endedAt)}` : ''}
                      {' · '}
                      {durationLabel(days)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}