// src/app/components/system/pessoais-admin.tsx
//
// Quem tem as finanças pessoais ligadas.
//
// ─── PORQUE É QUE ISTO EXISTE EM VEZ DE UM EMAIL NO CÓDIGO ──────────────────
//
// Porque a alternativa era escrever um email numa condição dentro do programa.
// Ficaria publicado no repositório, deixaria de funcionar no dia em que esse
// email mudasse — sem avisar, que é o pior modo de avariar — e ligar o mesmo
// numa segunda conta obrigava a mexer no código e a esperar por um deploy.
//
// Assim é uma marca na conta: dados, não programa. Liga-se e desliga-se aqui,
// tem efeito no pedido seguinte, e o programa não sabe o nome de ninguém.
//
// ─── E PORQUE É QUE ESTÁ NO PAINEL DA PLATAFORMA ────────────────────────────
//
// Porque não é da frota. Um administrador de uma frota cliente não tem nada
// que dar a si próprio, nem a um motorista dele, uma gaveta privada dentro do
// sistema — e no painel da frota era exactamente isso que ficava ao alcance
// de qualquer um deles.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Coins, Info, X } from 'lucide-react';
import { systemService } from '@/features/system/services/system.service';

export function PessoaisAdmin() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const contas = useQuery({
    queryKey: ['sistema', 'pessoais'],
    queryFn: () => systemService.contasPessoais(),
  });

  const definir = useMutation({
    mutationFn: ({ e, ligar }: { e: string; ligar: boolean }) =>
      systemService.definirPessoais(e, ligar),
    onSuccess: (r, v) => {
      setErro(null);
      setEmail('');
      // Dito quando NÃO houve nada a mudar, e não quando houve: a lista
      // actualiza-se à vista e já diz o que aconteceu. O que precisa de ser
      // dito é o caso em que o ecrã não mexeu — senão parece que falhou.
      setAviso(r.alterado
        ? null
        : `${r.email} já ${v.ligar ? 'tinha' : 'não tinha'} as finanças pessoais.`);
      qc.invalidateQueries({ queryKey: ['sistema', 'pessoais'] });
    },
    onError: (e: unknown) => {
      setAviso(null);
      setErro((e as { message?: string })?.message ?? 'Não foi possível.');
    },
  });

  const lista = contas.data?.contas ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4" aria-hidden="true" />
          Finanças pessoais
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Dá à conta um menu privado com o diário de trading e as despesas
            pessoais. As despesas saem do saldo dessa pessoa; o trading é só
            estatística. Ninguém mais vê o que lá está dentro —{' '}
            <strong className="text-foreground">nem os administradores da frota dela</strong>.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email da conta"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErro(null); setAviso(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email.trim()) {
                definir.mutate({ e: email.trim(), ligar: true });
              }
            }}
          />
          <Button
            disabled={!email.trim() || definir.isPending}
            onClick={() => definir.mutate({ e: email.trim(), ligar: true })}
          >
            Ligar
          </Button>
        </div>

        {erro && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}
        {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

        <div className="space-y-2">
          {contas.isLoading && <Skeleton className="h-12 w-full" />}

          {!contas.isLoading && lista.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma conta tem isto ligado.
            </p>
          )}

          {lista.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.nome}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {c.email} · {c.frota}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={definir.isPending}
                onClick={() => definir.mutate({ e: c.email, ligar: false })}
                // Dito, porque é a pergunta que alguém faz antes de carregar.
                title="Desligar. Os registos não se perdem — deixam de estar acessíveis."
              >
                <X className="mr-1.5 h-4 w-4" />
                Desligar
              </Button>
            </div>
          ))}
        </div>

        {/* Dito aqui, debaixo do botão de desligar: desligar não apaga nada, e
            sem o dizer ninguém se atreve a carregar — ou carrega a pensar que
            está a limpar os dados, que é pior. */}
        <p className="text-xs text-muted-foreground">
          Desligar não apaga nada. Os lançamentos ficam na base de dados e
          voltam a aparecer se a marca for ligada outra vez.
        </p>
      </CardContent>
    </Card>
  );
}
