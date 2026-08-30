// src/app/components/admin/queue/panels.tsx
//
// O que aparece quando uma linha da fila é expandida.
//
// ─── A DISCIPLINA QUE MANTÉM ISTO SÃO ────────────────────────────────────────
//
// O painel resolve a CAUDA; as telas resolvem o VOLUME.
//
// Cada painel mostra no máximo PANEL_LIMIT itens e remete o resto para a tela
// dedicada. Sem esse limite, expandir "23 documentos por rever" transformava o
// painel numa versão pior da tela de Documentos — com menos filtros, menos
// ordenação, e a mesma lógica escrita duas vezes.
//
// E só há resolução em linha quando a decisão cabe num botão ou num campo.
// Aprovar um lançamento é um clique. Fechar uma semana são sete campos com
// pré-visualização — isso abre onde tem de abrir, mas já no motorista certo.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  AlertCircle, ArrowRight, Check, Loader2, Send, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { earningsService } from '@/features/driver/services/earnings.service';
import { supportService } from '@/features/driver/services/support.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { notificationsService } from '@/features/driver/services/notifications.service';
import { usersService } from '@/features/admin/services/users.service';
import { formatCurrency } from '@/shared/lib/format';
import { queryKeys } from '@/shared/lib/query-keys';
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/document-labels';
import { PANEL_LIMIT, type QueueItem } from './types';

// ── Peças partilhadas ─────────────────────────────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="space-y-2 py-2" role="status" aria-busy="true">
      <span className="sr-only">A carregar…</span>
      {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
    </div>
  );
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="flex-1 text-sm text-muted-foreground">Não foi possível carregar.</p>
      <Button size="sm" variant="outline" className="h-7" onClick={onRetry}>Tentar</Button>
    </div>
  );
}

/**
 * O rodapé que remete para a tela dedicada.
 *
 * Aparece sempre, e não só quando há mais do que cabe: mesmo com dois itens à
 * vista, quem quiser filtrar, ordenar ou ver o histórico tem de saber para onde
 * ir. Esconder o caminho quando a lista é curta ensina que ele não existe.
 */
function PanelFooter({ to, label, hidden }: { to: string; label: string; hidden: number }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      <span>{hidden > 0 ? `Mais ${hidden} — ${label}` : label}</span>
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/** Linha com nome à esquerda e ação à direita. A forma de quase tudo aqui. */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 py-2 last:border-0">
      {children}
    </li>
  );
}

// ── Resolver: lançamentos comunicados ─────────────────────────────────────────

function EarningsPanel() {
  const queryClient = useQueryClient();
  const [aDecidir, setADecidir] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.earnings.all, 'pending-queue'],
    queryFn: () => earningsService.list({ status: 'PENDING' }),
  });

  const { mutate } = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      earningsService.review(id, { status: approve ? 'APPROVED' : 'REJECTED' }),
    onMutate: ({ id }) => setADecidir(id),
    onSettled: () => setADecidir(null),
    onSuccess: (_r, { approve }) => {
      // O resumo do painel e a lista expandida: sem os dois, o contador do
      // topo continuava a dizer 2 depois de resolver ambos.
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success(approve ? 'Lançamento confirmado.' : 'Lançamento rejeitado.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível decidir.'),
  });

  if (isLoading) return <PanelSkeleton />;
  if (isError) return <PanelError onRetry={() => refetch()} />;

  const todos = data?.earnings ?? [];
  const visiveis = todos.slice(0, PANEL_LIMIT);

  return (
    <>
      <ul>
        {visiveis.map((e) => (
          <Row key={e.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {formatCurrency(Number(e.amount))} · {e.platform}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(e.date).toLocaleDateString('pt-PT')}
                {e.notes ? ` · ${e.notes}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                size="sm" className="h-7 px-2.5" disabled={aDecidir === e.id}
                onClick={() => mutate({ id: e.id, approve: true })}
              >
                {aDecidir === e.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="ml-1">Confirmar</span>
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 px-2.5" disabled={aDecidir === e.id}
                onClick={() => mutate({ id: e.id, approve: false })}
                aria-label="Rejeitar"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </Row>
        ))}
      </ul>
      <PanelFooter
        to="/app/admin/settlements"
        label="Abrir a revisão de lançamentos"
        hidden={todos.length - visiveis.length}
      />
    </>
  );
}

// ── Resolver: tickets de suporte ──────────────────────────────────────────────

function SupportPanel() {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.support.all, 'open-queue'],
    queryFn: () => supportService.list(),
  });

  const { mutate: responder, isPending } = useMutation({
    mutationFn: ({ id, msg }: { id: string; msg: string }) => supportService.addReply(id, msg),
    onSuccess: async (_r, { id }) => {
      // Responder e deixar o ticket aberto seria responder e não resolver: ele
      // continuava na fila a dizer que espera. Passa a EM CURSO, que é o que
      // significa — alguém já lhe pegou.
      await supportService.updateStatus(id, 'IN_PROGRESS').catch(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.support.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success('Resposta enviada.');
      setAberto(null);
      setResposta('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível responder.'),
  });

  if (isLoading) return <PanelSkeleton />;
  if (isError) return <PanelError onRetry={() => refetch()} />;

  const abertos = (data?.tickets ?? []).filter(
    (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS',
  );
  const visiveis = abertos.slice(0, PANEL_LIMIT);

  return (
    <>
      <ul>
        {visiveis.map((t) => (
          <li key={t.id} className="border-b border-border/60 py-2 last:border-0">
            <button
              type="button"
              onClick={() => { setAberto(aberto === t.id ? null : t.id); setResposta(''); }}
              className="flex w-full items-center gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString('pt-PT')}
                  {t.status === 'IN_PROGRESS' ? ' · em curso' : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {aberto === t.id ? 'Fechar' : 'Responder'}
              </span>
            </button>

            {aberto === t.id && (
              <div className="mt-2 space-y-2">
                {/* A mensagem original, para não ser preciso abrir o Suporte só
                    para saber ao que se está a responder. */}
                <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                  {t.message}
                </p>
                <Textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  placeholder="Escreva a resposta…"
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end">
                  <Button
                    size="sm" className="h-7"
                    disabled={isPending || !resposta.trim()}
                    onClick={() => responder({ id: t.id, msg: resposta.trim() })}
                  >
                    {isPending
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      : <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <PanelFooter
        to="/app/admin/support"
        label="Abrir o Suporte"
        hidden={abertos.length - visiveis.length}
      />
    </>
  );
}

// ── Resolver: documentos a expirar ────────────────────────────────────────────

function ExpiringPanel({ days }: { days: number }) {
  const [avisados, setAvisados] = useState<Set<string>>(new Set());
  const [aEnviar, setAEnviar] = useState<string | null>(null);

  const docsQ = useQuery({
    queryKey: [...queryKeys.documents.all, 'expiring-queue'],
    queryFn: () => documentsService.list(),
  });
  const usersQ = useQuery({
    queryKey: queryKeys.users.allUnpaged,
    queryFn: () => usersService.listAll(),
  });

  const { mutate: avisar } = useMutation({
    mutationFn: ({ userId, title, message }: { userId: string; title: string; message: string }) =>
      notificationsService.create(userId, title, message),
    onMutate: ({ userId }) => setAEnviar(userId),
    onSettled: () => setAEnviar(null),
    onSuccess: (_r, { userId }) => {
      // Marca em memória e não no servidor: não há campo para "já foi avisado",
      // e inventá-lo obrigava a uma migração para um estado que se resolve
      // sozinho quando o motorista enviar o documento. O sinal serve para não
      // se clicar duas vezes na mesma sessão.
      setAvisados((s) => new Set(s).add(userId));
      toast.success('Motorista avisado.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível avisar.'),
  });

  if (docsQ.isLoading || usersQ.isLoading) return <PanelSkeleton />;
  if (docsQ.isError) return <PanelError onRetry={() => docsQ.refetch()} />;

  const limite = Date.now() + days * 86_400_000;
  const aExpirar = (docsQ.data?.documents ?? []).filter((d) => {
    if (!d.expiresAt || d.status !== 'APPROVED') return false;
    const t = new Date(d.expiresAt).getTime();
    return t > Date.now() && t <= limite;
  });

  const nome = (id: string) => usersQ.data?.users.find((u) => u.id === id)?.name ?? '—';
  const visiveis = aExpirar.slice(0, PANEL_LIMIT);

  return (
    <>
      <ul>
        {visiveis.map((d) => {
          const label = DOCUMENT_TYPE_LABELS[d.type] ?? d.type;
          const quando = new Date(d.expiresAt!).toLocaleDateString('pt-PT');
          const jaAvisado = avisados.has(d.userId);
          return (
            <Row key={d.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nome(d.userId)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {label} · expira a {quando}
                </p>
              </div>
              <Button
                size="sm" variant={jaAvisado ? 'outline' : 'default'}
                className="h-7 shrink-0 px-2.5"
                disabled={aEnviar === d.userId || jaAvisado}
                onClick={() => avisar({
                  userId: d.userId,
                  title: `${label} expira a ${quando}`,
                  message:
                    `O seu documento "${label}" expira a ${quando}. ` +
                    'Envie o documento atualizado no portal para não ficar impedido de trabalhar.',
                })}
              >
                {aEnviar === d.userId
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : jaAvisado
                    ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="ml-1">{jaAvisado ? 'Avisado' : 'Avisar'}</span>
              </Button>
            </Row>
          );
        })}
      </ul>
      <PanelFooter
        to="/app/admin/documents"
        label="Abrir Documentos"
        hidden={aExpirar.length - visiveis.length}
      />
    </>
  );
}

// ── Abrir: listas que levam ao sítio certo ────────────────────────────────────

/**
 * Motoristas por fechar, cada um com o fecho da semana dele.
 *
 * Antes, o botão levava para a tela de Fechos com o PRIMEIRO da lista
 * pré-selecionado. Com três em falta, fechava-se um e voltava-se atrás para
 * caçar o seguinte. Agora cada linha abre o seu.
 */
function SettlementsPanel({ item }: { item: QueueItem }) {
  const navigate = useNavigate();
  const drivers = item.drivers ?? [];
  const visiveis = drivers.slice(0, PANEL_LIMIT);

  return (
    <>
      <ul>
        {visiveis.map((d) => (
          <Row key={d.id}>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</p>
            <Button
              size="sm" className="h-7 shrink-0 px-2.5"
              onClick={() => navigate('/app/admin/settlements', {
                state: { userId: d.id, ...item.navState },
              })}
            >
              Fechar semana
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Row>
        ))}
      </ul>
      <PanelFooter
        to="/app/admin/settlements"
        label="Abrir Fechos"
        hidden={item.count - visiveis.length}
      />
    </>
  );
}

/** Motoristas sem ação associada — saldo negativo, bloqueados. */
function DriversPanel({ item, to }: { item: QueueItem; to: string }) {
  const navigate = useNavigate();
  const drivers = item.drivers ?? [];

  if (drivers.length === 0) {
    return <PanelFooter to={to} label="Ver na lista de motoristas" hidden={0} />;
  }

  return (
    <>
      <ul>
        {drivers.slice(0, PANEL_LIMIT).map((d) => (
          <Row key={d.id}>
            <p className="min-w-0 flex-1 truncate text-sm">{d.name}</p>
            {d.balance !== undefined && (
              <p className="shrink-0 text-sm font-medium tabular-nums text-destructive">
                {formatCurrency(d.balance)}
              </p>
            )}
            <Button
              size="sm" variant="ghost" className="h-7 shrink-0 px-2"
              onClick={() => navigate(`/app/admin/drivers/${d.id}`)}
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Row>
        ))}
      </ul>
      <PanelFooter
        to={to}
        label="Ver todos os motoristas"
        hidden={item.count - Math.min(drivers.length, PANEL_LIMIT)}
      />
    </>
  );
}

/** Um atalho só, para itens cuja lista vive inteira noutra tela. */
function LinkPanel({ to, label }: { to: string; label: string }) {
  return <PanelFooter to={to} label={label} hidden={0} />;
}

// ── O despachante ─────────────────────────────────────────────────────────────

export function QueuePanel({ item, expiringDays }: { item: QueueItem; expiringDays: number }) {
  switch (item.panel) {
    case 'earnings':    return <EarningsPanel />;
    case 'support':     return <SupportPanel />;
    case 'expiring':    return <ExpiringPanel days={expiringDays} />;
    case 'settlements': return <SettlementsPanel item={item} />;
    case 'drivers':     return <DriversPanel item={item} to="/app/admin/drivers" />;
    case 'withdrawals': return <LinkPanel to="/app/admin/financial" label="Abrir o Financeiro" />;
    case 'bank':        return <LinkPanel to="/app/admin/financial" label="Abrir a aprovação de IBAN" />;
    case 'documents':   return <LinkPanel to="/app/admin/documents" label="Abrir Documentos" />;
    default:            return null;
  }
}
