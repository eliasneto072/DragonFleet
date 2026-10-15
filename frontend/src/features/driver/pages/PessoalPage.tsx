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
import { ImportarExtratos } from '@/app/components/shared/importar-extratos';
import { Wallet, LineChart, Tags, Upload, Landmark } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { PessoalTrading } from '@/app/components/driver/pessoal-trading';
import { PessoalDespesas } from '@/app/components/driver/pessoal-despesas';
import { PessoalCategorias } from '@/app/components/driver/pessoal-categorias';
import { PessoalCreditos } from '@/app/components/driver/pessoal-creditos';

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
          {/* Os créditos ANTES das categorias, como ele pediu. E a seguir ao
              trading por uma razão: é a página que se abre para decidir, não
              para lançar — não é trabalho de todos os dias. */}
          <TabsTrigger value="creditos" className="gap-1.5">
            <Landmark className="h-4 w-4" />
            Créditos
          </TabsTrigger>
          {/* As categorias no fim: arrumam-se uma vez por mês, e vão ser
              muitas. Em cima da lista de despesas empurravam para fora do
              ecrã aquilo a que se vem. */}
          {/* A importação a seguir aos créditos: é o que traz as despesas
              todas de uma vez, e quem a usa vem cá de propósito uma vez por
              mês — não é trabalho de todos os dias. */}
          <TabsTrigger value="importar" className="gap-1.5">
            <Upload className="h-4 w-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5">
            <Tags className="h-4 w-4" />
            Categorias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="despesas" className="mt-6">
          <PessoalDespesas />
        </TabsContent>
        <TabsContent value="trading" className="mt-6">
          <PessoalTrading />
        </TabsContent>
        <TabsContent value="creditos" className="mt-6">
          <PessoalCreditos />
        </TabsContent>
        <TabsContent value="importar" className="mt-6">
          <ImportarExtratos ambito="PESSOAL" />
        </TabsContent>
        <TabsContent value="categorias" className="mt-6">
          <PessoalCategorias />
        </TabsContent>
      </Tabs>
    </div>
  );
}
