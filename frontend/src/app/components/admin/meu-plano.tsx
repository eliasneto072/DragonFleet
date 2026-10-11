// src/app/components/admin/meu-plano.tsx
//
// O plano desta frota, e os que há para escolher.
//
// ─── PARA QUE SERVE ESTA TELA ───────────────────────────────────────────────
//
// Para responder à pergunta que alguém tem na cabeça depois de bater num
// cadeado: "o que é que me falta, e quanto custa". Daí a ordem do que se
// mostra — primeiro o que o plano ACRESCENTA ao que já tem, e só depois a
// lista completa de cada um. Quem chega aqui não quer ler dezassete caixas
// iguais às que já tem: quer ver as três que lhe faltam.
//
// ─── E PORQUE É QUE O BOTÃO NÃO COBRA NADA ──────────────────────────────────
//
// Porque não há pagamentos no sistema. O botão regista um pedido, que aparece
// na lista do dono da plataforma — e é ele que fala com o cliente e muda o
// plano à mão. Dizê-lo por escrito na tela é melhor do que deixar alguém
// carregar à espera de que algo mude sozinho.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Loader2, Package, Plus, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency, formatDate } from '@/shared/lib/format';
import { FUNCIONALIDADES_DO_MENU } from '@/features/admin/components/AdminLayout';
import {
  meuPlanoService, type PlanoParaCliente,
} from '@/features/admin/services/meu-plano.service';

const NOME = new Map(FUNCIONALIDADES_DO_MENU.map((f) => [f.codigo, f.nome]));
const nomeDe = (codigo: string) => NOME.get(codigo) ?? codigo;

function duracao(dias: number): string {
  if (dias === 30) return 'por mês';
  if (dias === 90) return 'por trimestre';
  if (dias === 180) return 'por semestre';
  if (dias === 365) return 'por ano';
  return `por ${dias} dias`;
}

// ── Pedir ────────────────────────────────────────────────────────────────────

function PedirDialog({
  plano, aberto, onClose,
}: {
  /** `null` é o pedido à medida: nenhum dos planos serve. */
  plano: PlanoParaCliente | null;
  aberto: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mensagem, setMensagem] = useState('');

  const m = useMutation({
    mutationFn: () => meuPlanoService.pedir({
      planoId: plano?.id ?? null,
      mensagem: mensagem.trim() || null,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: queryKeys.meuPlano.all });
      toast.success(
        r.actualizado
          // Um pedido de cada vez: o segundo altera o primeiro em vez de
          // abrir outro. Dito por palavras, para não parecer que se perdeu.
          ? 'Pedido actualizado. Vamos responder-lhe.'
          : 'Pedido enviado. Vamos responder-lhe.',
      );
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível enviar o pedido.'),
  });

  const aMedida = plano === null;
  const podeEnviar = !aMedida || mensagem.trim().length > 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {aMedida ? 'Pedir um plano à medida' : `Pedir o plano ${plano.nome}`}
          </DialogTitle>
          <DialogDescription>
            {aMedida
              ? 'Escreva o que precisa e nós preparamos uma proposta.'
              : 'Isto não cobra nada. Regista o pedido, e nós falamos consigo '
                + 'para tratar da mudança.'}
          </DialogDescription>
        </DialogHeader>

        {!aMedida && plano.acrescenta.length > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium">O que passa a ter</p>
            <div className="flex flex-wrap gap-1.5">
              {plano.acrescenta.map((f) => (
                <span
                  key={f.codigo}
                  className="inline-flex items-center gap-1 text-xs rounded-md bg-muted px-2 py-1"
                >
                  <Plus className="h-3 w-3 text-emerald-600" />
                  {f.nome}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(plano.preco)} {duracao(plano.duracaoDias)}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>{aMedida ? 'O que precisa' : 'Quer dizer-nos alguma coisa? (opcional)'}</Label>
          <Textarea
            rows={4}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder={aMedida
              ? 'Por exemplo: preciso da oficina e do material, mas não da faturação.'
              : 'Quando quer mudar, dúvidas sobre o preço…'}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!podeEnviar || m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────

export function MeuPlano() {
  const qc = useQueryClient();
  const [aPedir, setAPedir] = useState<PlanoParaCliente | null>(null);
  const [aMedida, setAMedida] = useState(false);

  const q = useQuery({
    queryKey: queryKeys.meuPlano.detail,
    queryFn: () => meuPlanoService.get(),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => meuPlanoService.cancelar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meuPlano.all });
      toast.success('Pedido cancelado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível cancelar.'),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const d = q.data;
  if (!d) return null;

  const melhorias = d.disponiveis.filter((p) => !p.oMeu && p.acrescenta.length > 0);
  const semPlano = d.atual.nome === null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="O meu plano"
        subtitle="O que a sua frota tem contratado, e o que pode acrescentar."
        icon={<Package className="h-5 w-5" />}
      />

      {/* ── O pedido que está à espera ───────────────────────────────────── */}
      {d.pedidoAberto && (
        <Card className="border-brand-500/40 bg-brand-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Clock className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Já tem um pedido à espera de resposta
                  {d.pedidoAberto.planoNome ? `: plano ${d.pedidoAberto.planoNome}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Enviado a {formatDate(d.pedidoAberto.criadoEm)}
                  {d.pedidoAberto.mensagem ? ` · "${d.pedidoAberto.mensagem}"` : ''}
                </p>
              </div>
            </div>
            <Button
              variant="ghost" size="sm" className="shrink-0"
              onClick={() => cancelar.mutate(d.pedidoAberto!.id)}
              disabled={cancelar.isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── O plano actual ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Plano actual
              </p>
              <h2 className="text-xl font-semibold">
                {d.atual.nome ?? 'Sem plano atribuído'}
              </h2>
              {d.atual.preco && d.atual.duracaoDias && (
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(d.atual.preco)} {duracao(d.atual.duracaoDias)}
                </p>
              )}
            </div>
            {d.atual.terminaEm && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pago até
                </p>
                <p className="text-sm font-medium">{formatDate(d.atual.terminaEm)}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {d.atual.funcionalidades.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 text-xs rounded-md bg-muted px-2 py-1"
              >
                <Check className="h-3 w-3 text-emerald-600" />
                {nomeDe(c)}
              </span>
            ))}
          </div>

          {semPlano && (
            <p className="text-sm text-muted-foreground">
              A sua frota está sem plano atribuído e tem acesso a tudo. Fale
              connosco para acertar o plano certo para si.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── As melhorias ─────────────────────────────────────────────────── */}
      {melhorias.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            O que pode acrescentar
          </h2>

          <div className="grid gap-4 lg:grid-cols-2">
            {melhorias.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-5 space-y-4">
                  <div>
                    <h3 className="font-semibold">{p.nome}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(p.preco)} {duracao(p.duracaoDias)}
                    </p>
                  </div>

                  {/* O que ACRESCENTA, e não a lista toda: é a pergunta que
                      traz alguém a esta página. */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Passa a ter
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.acrescenta.map((f) => (
                        <span
                          key={f.codigo}
                          className="inline-flex items-center gap-1 text-xs rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-1"
                        >
                          <Plus className="h-3 w-3" />
                          {f.nome}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button className="w-full" onClick={() => setAPedir(p)}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Quero este plano
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── À medida ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-medium">Nenhum destes serve?</p>
            <p className="text-sm text-muted-foreground">
              Diga-nos o que precisa e preparamos uma proposta à medida.
            </p>
          </div>
          <Button variant="outline" onClick={() => setAMedida(true)}>
            Falar connosco
          </Button>
        </CardContent>
      </Card>

      {aPedir && (
        <PedirDialog
          key={aPedir.id} plano={aPedir} aberto
          onClose={() => setAPedir(null)}
        />
      )}
      {aMedida && (
        <PedirDialog key="medida" plano={null} aberto onClose={() => setAMedida(false)} />
      )}
    </div>
  );
}
