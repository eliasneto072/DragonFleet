// src/features/driver/pages/PessoalPage.tsx
//
// As finanças pessoais, numa página com dois separadores.
//
// ─── PORQUE É QUE A PÁGINA SE DEFENDE A SI PRÓPRIA ──────────────────────────
//
// Porque esconder um menu nunca foi uma permissão. O menu não aparece a quem
// não tem a marca, mas o endereço continua a existir e qualquer pessoa o pode
// escrever na barra. Aqui, sem a marca, a página redirecciona.
//
// E é a terceira camada, não a primeira: o servidor responde 404 a estas
// rotas sem a marca, e o serviço só trabalha sobre o próprio. Isto existe
// para quem escrever o endereço ver o painel dele em vez de uma página vazia
// com erros — não para guardar nada.
//
// ─── PORQUE É QUE OS DOIS VIVEM JUNTOS ──────────────────────────────────────
//
// Porque são a mesma pergunta vista de dois lados: quanto entra e quanto sai.
// Separados em dois menus, obrigavam a saltar entre eles para responder a uma
// coisa só — e acrescentavam duas entradas a uma barra lateral que já é longa.
//
// Mas as contas NÃO se misturam, e é por isso que são separadores e não uma
// soma: o trading é estatística e as despesas saem do saldo. Somá-los num
// número só dava um valor que não quer dizer nada.

import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Wallet, LineChart } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { PessoalTrading } from '@/app/components/driver/pessoal-trading';
import { PessoalDespesas } from '@/app/components/driver/pessoal-despesas';

export default function PessoalPage() {
  const { user } = useAuth();

  if (!user?.personalFinance) return <Navigate to="/app/driver/dashboard" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pessoal</h1>
        <p className="text-muted-foreground">
          O teu diário de trading e as tuas despesas
        </p>
      </div>

      <Tabs defaultValue="despesas">
        <TabsList>
          {/* As despesas primeiro: são as que mexem no saldo, e por isso as
              que se vêm cá ver com mais frequência. */}
          <TabsTrigger value="despesas" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            Despesas
          </TabsTrigger>
          <TabsTrigger value="trading" className="gap-1.5">
            <LineChart className="h-4 w-4" />
            Trading
          </TabsTrigger>
        </TabsList>

        <TabsContent value="despesas" className="mt-6">
          <PessoalDespesas />
        </TabsContent>
        <TabsContent value="trading" className="mt-6">
          <PessoalTrading />
        </TabsContent>
      </Tabs>
    </div>
  );
}
