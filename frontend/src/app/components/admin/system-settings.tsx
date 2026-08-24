// src/app/components/admin/system-settings.tsx
//
// Now FUNCTIONAL: loads settings from GET /settings and persists via PUT /settings.
// Previously handleSave only called alert() and nothing was stored. Adds loading,
// saving and "dirty" states, plus a working "Restaurar padrões".

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { PageHeader } from '@/app/components/ui/page-header';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Settings, DollarSign, Bell, Zap, Save, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { settingsService, type SystemSettings as Settings_ } from '@/features/admin/services/settings.service';
import { queryKeys } from '@/shared/lib/query-keys';

const DEFAULTS: Settings_ = {
  companyCommission: 15,
  settlementTaxRate: 6,
  minWithdrawalAmount: 50,
  maxWithdrawalAmount: 5000,
  withdrawalProcessingDays: 1,
  documentExpiryWarningDays: 30,
  uberIntegration: true,
  boltIntegration: true,
  emailNotifications: true,
  smsNotifications: false,
  autoApproveDocuments: false,
  requireTwoFactorAuth: false,
};

// Espelha a estrutura real: cabeçalho e os cartões de campos.
function SettingsSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar configurações…</span>

      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      {[0, 1].map((card) => (
        <Card key={card}>
          <CardHeader><Skeleton className="h-5 w-44" /></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

export function SystemSettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Settings_>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings?.detail ?? ['settings'],
    queryFn: () => settingsService.get(),
  });

  useEffect(() => {
    if (data?.settings) {
      setSettings({ ...DEFAULTS, ...data.settings });
      setDirty(false);
    }
  }, [data]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => settingsService.update(settings),
    onSuccess: ({ settings: saved }) => {
      queryClient.setQueryData(queryKeys.settings?.detail ?? ['settings'], { settings: saved });
      setSettings({ ...DEFAULTS, ...saved });
      setDirty(false);
      toast.success('Configurações guardadas com sucesso!');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao guardar configurações.'),
  });

  function update<K extends keyof Settings_>(key: K, value: Settings_[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function restoreDefaults() {
    setSettings(DEFAULTS);
    setDirty(true);
    toast.message('Padrões restaurados', { description: 'Clique em "Guardar" para confirmar.' });
  }

  if (isLoading) return <SettingsSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar configurações.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.settings?.detail ?? ['settings'] })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Configurações do sistema"
        subtitle="Gerir parâmetros globais da plataforma"
        icon={<Settings className="h-5 w-5" />}
      />

      {/* Financeiro */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Configurações financeiras</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="commission">Comissão da empresa (%)</Label>
              <Input id="commission" type="number" min={0} max={100} className="mt-2"
                value={settings.companyCommission}
                onChange={(e) => update('companyCommission', parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground mt-1">
                Incide sobre o lucro da semana, depois das despesas e do imposto
              </p>
            </div>
            <div>
              <Label htmlFor="tax">Imposto sobre a faturação (%)</Label>
              <Input id="tax" type="number" min={0} max={100} step={0.01} className="mt-2"
                value={settings.settlementTaxRate}
                onChange={(e) => update('settlementTaxRate', parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground mt-1">
                Calculado sobre as receitas da Uber e da Bolt no fecho semanal.
                Vale a partir do próximo fecho — os já registados guardam a taxa
                que lhes foi aplicada.
              </p>
            </div>
            <div>
              <Label htmlFor="processing">Dias de processamento de retiradas</Label>
              <Input id="processing" type="number" min={0} className="mt-2"
                value={settings.withdrawalProcessingDays}
                onChange={(e) => update('withdrawalProcessingDays', parseInt(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground mt-1">Tempo médio para processar retiradas</p>
            </div>
            <div>
              <Label htmlFor="minWithdrawal">Valor mínimo de retirada (€)</Label>
              <Input id="minWithdrawal" type="number" min={0} className="mt-2"
                value={settings.minWithdrawalAmount}
                onChange={(e) => update('minWithdrawalAmount', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="maxWithdrawal">Valor máximo de retirada (€)</Label>
              <Input id="maxWithdrawal" type="number" min={0} className="mt-2"
                value={settings.maxWithdrawalAmount}
                onChange={(e) => update('maxWithdrawalAmount', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrações */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Integrações de plataformas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">U</span>
              </div>
              <div>
                <h3 className="font-semibold">Integração Uber</h3>
                <p className="text-sm text-muted-foreground">Importar ganhos via CSV exportado da Uber</p>
              </div>
            </div>
            <Switch checked={settings.uberIntegration} onCheckedChange={(c) => update('uberIntegration', c)} />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-[#108865] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">B</span>
              </div>
              <div>
                <h3 className="font-semibold">Integração Bolt</h3>
                <p className="text-sm text-muted-foreground">Importar ganhos via CSV exportado da Bolt</p>
              </div>
            </div>
            <Switch checked={settings.boltIntegration} onCheckedChange={(c) => update('boltIntegration', c)} />
          </div>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notificações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Notificações por email</h3>
              <p className="text-sm text-muted-foreground">Enviar emails para motoristas sobre atualizações importantes</p>
            </div>
            <Switch checked={settings.emailNotifications} onCheckedChange={(c) => update('emailNotifications', c)} />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Notificações por SMS</h3>
              <p className="text-sm text-muted-foreground">Enviar SMS para alertas críticos e urgentes</p>
            </div>
            <Switch checked={settings.smsNotifications} onCheckedChange={(c) => update('smsNotifications', c)} />
          </div>
        </CardContent>
      </Card>

      {/* Segurança */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Segurança e automação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="expiryWarning">Aviso de expiração de documentos (dias)</Label>
            <Input id="expiryWarning" type="number" min={0} className="mt-2 max-w-xs"
              value={settings.documentExpiryWarningDays}
              onChange={(e) => update('documentExpiryWarningDays', parseInt(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground mt-1">Notificar motoristas X dias antes do documento expirar</p>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Aprovação automática de documentos</h3>
              <p className="text-sm text-muted-foreground">Aprovar automaticamente documentos válidos após verificação</p>
            </div>
            <Switch checked={settings.autoApproveDocuments} onCheckedChange={(c) => update('autoApproveDocuments', c)} />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Autenticação de dois fatores</h3>
              <p className="text-sm text-muted-foreground">Exigir 2FA para todos os administradores</p>
            </div>
            <Switch checked={settings.requireTwoFactorAuth} onCheckedChange={(c) => update('requireTwoFactorAuth', c)} />
          </div>
        </CardContent>
      </Card>

      {/* Ações */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={restoreDefaults} disabled={saving}>Restaurar padrões</Button>
        <Button onClick={() => save()} disabled={saving || !dirty}>
          {saving
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A guardar…</>
            : <><Save className="h-4 w-4 mr-2" />Guardar configurações</>}
        </Button>
      </div>
    </div>
  );
}
