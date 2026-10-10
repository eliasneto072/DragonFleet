// src/features/admin/pages/PlanoNecessarioPage.tsx
//
// A tela que se vê ao carregar num menu com cadeado.
//
// ─── PORQUE É QUE ISTO EXISTE EM VEZ DE O MENU DESAPARECER ──────────────────
//
// Porque um menu que não existe nunca é comprado. Escondido, o cliente fica
// com um painel limpo e nunca descobre que há mais — e nunca liga a perguntar
// o preço. Com cadeado, o painel é também a montra.
//
// O que isto NÃO pode ser é uma parede com um cartaz de vendas. Quem chega
// aqui carregou no menu à espera de trabalhar: a tela diz o que é aquilo em
// duas linhas, diz que faz parte de outro plano, e dá o caminho para o pedir.
// Mais do que isso irrita ao segundo clique.

import { useParams, Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { FUNCIONALIDADES_DO_MENU } from '@/features/admin/components/AdminLayout';

export function PlanoNecessarioPage() {
  const { codigo } = useParams<{ codigo?: string }>();
  const f = FUNCIONALIDADES_DO_MENU.find((x) => x.codigo === codigo);

  return (
    <div className="max-w-xl mx-auto py-12">
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-secondary mx-auto flex items-center justify-center">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold">
              {f?.nome ?? 'Esta secção'} faz parte de outro plano
            </h1>
            {f?.descricao && (
              <p className="text-sm text-muted-foreground">{f.descricao}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            O plano da sua frota não inclui esta secção. Fale com quem gere a
            vossa conta para a acrescentar.
          </p>

          <Button variant="outline" asChild>
            <Link to="/app/admin/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao painel
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
