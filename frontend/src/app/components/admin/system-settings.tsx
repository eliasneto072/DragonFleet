import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { Settings, DollarSign, Bell, Zap, Save } from 'lucide-react';
import { useState } from 'react';

export function SystemSettings() {
  const [settings, setSettings] = useState({
    companyCommission: 15,
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
  });

  const handleSave = () => {
    alert('Configurações guardadas com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Configurações do Sistema</h2>
        <p className="text-muted-foreground">Gerir parâmetros globais da plataforma</p>
      </div>

      {/* Financial Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Configurações Financeiras
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="commission">Comissão da Empresa (%)</Label>
              <Input
                id="commission"
                type="number"
                value={settings.companyCommission}
                onChange={(e) =>
                  setSettings({ ...settings, companyCommission: parseFloat(e.target.value) })
                }
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Percentagem cobrada em cada viagem
              </p>
            </div>

            <div>
              <Label htmlFor="processing">Dias de Processamento de Retiradas</Label>
              <Input
                id="processing"
                type="number"
                value={settings.withdrawalProcessingDays}
                onChange={(e) =>
                  setSettings({ ...settings, withdrawalProcessingDays: parseInt(e.target.value) })
                }
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tempo médio para processar retiradas
              </p>
            </div>

            <div>
              <Label htmlFor="minWithdrawal">Valor Mínimo de Retirada (€)</Label>
              <Input
                id="minWithdrawal"
                type="number"
                value={settings.minWithdrawalAmount}
                onChange={(e) =>
                  setSettings({ ...settings, minWithdrawalAmount: parseFloat(e.target.value) })
                }
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="maxWithdrawal">Valor Máximo de Retirada (€)</Label>
              <Input
                id="maxWithdrawal"
                type="number"
                value={settings.maxWithdrawalAmount}
                onChange={(e) =>
                  setSettings({ ...settings, maxWithdrawalAmount: parseFloat(e.target.value) })
                }
                className="mt-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Integrações de Plataformas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">U</span>
              </div>
              <div>
                <h3 className="font-semibold">Integração Uber</h3>
                <p className="text-sm text-muted-foreground">
                  Conectar com a API da Uber para sincronizar viagens
                </p>
              </div>
            </div>
            <Switch
              checked={settings.uberIntegration}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, uberIntegration: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-[#108865] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">B</span>
              </div>
              <div>
                <h3 className="font-semibold">Integração Bolt</h3>
                <p className="text-sm text-muted-foreground">
                  Conectar com a API da Bolt para sincronizar viagens
                </p>
              </div>
            </div>
            <Switch
              checked={settings.boltIntegration}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, boltIntegration: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Notificações por Email</h3>
              <p className="text-sm text-muted-foreground">
                Enviar emails para motoristas sobre atualizações importantes
              </p>
            </div>
            <Switch
              checked={settings.emailNotifications}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, emailNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Notificações por SMS</h3>
              <p className="text-sm text-muted-foreground">
                Enviar SMS para alertas críticos e urgentes
              </p>
            </div>
            <Switch
              checked={settings.smsNotifications}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, smsNotifications: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Segurança e Automação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="expiryWarning">Aviso de Expiração de Documentos (dias)</Label>
            <Input
              id="expiryWarning"
              type="number"
              value={settings.documentExpiryWarningDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  documentExpiryWarningDays: parseInt(e.target.value),
                })
              }
              className="mt-2 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Notificar motoristas X dias antes do documento expirar
            </p>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Aprovação Automática de Documentos</h3>
              <p className="text-sm text-muted-foreground">
                Aprovar automaticamente documentos válidos após verificação
              </p>
            </div>
            <Switch
              checked={settings.autoApproveDocuments}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, autoApproveDocuments: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h3 className="font-semibold">Autenticação de Dois Fatores</h3>
              <p className="text-sm text-muted-foreground">
                Exigir 2FA para todos os administradores
              </p>
            </div>
            <Switch
              checked={settings.requireTwoFactorAuth}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireTwoFactorAuth: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline">Restaurar Padrões</Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Guardar Configurações
        </Button>
      </div>
    </div>
  );
}
