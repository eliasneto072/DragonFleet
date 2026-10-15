// src/app/components/shared/bookings-board.tsx
//
// A lista de marcações e tudo o que se faz a uma.
//
// ─── PORQUE É QUE OS TRÊS PERFIS PARTILHAM ISTO ─────────────────────────────
//
// A gestão, o motorista e o mecânico olham para a MESMA marcação e precisam de
// ler a mesma coisa: que carro, que serviço, onde, quando, e em que ponto está.
// Três ecrãs separados divergiam ao segundo mês, e divergir aqui é o motorista
// a ler uma hora e a oficina a ter outra à frente — que é exactamente o
// problema que isto veio resolver.
//
// O que muda entre perfis são os BOTÕES, e esses derivam do estado e do `modo`.
// Quem pode mesmo fazer o quê é decidido no servidor (ver `regras.ts`): aqui
// só se evita mostrar um botão que vai dar 403.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';
import {
  CalendarClock, Car, CheckCircle2, Clock, FileText, MapPin, Phone, UserPlus,
  Wrench, X, Loader2, Ban, ExternalLink, Paperclip, Trash2,
} from 'lucide-react';
import { FilePicker } from '@/app/components/ui/file-picker';
import {
  bookingsService, ESTADOS, LOGISTICAS,
  type Booking, type BookingStatus, type BookingFileKind,
} from '@/features/admin/services/bookings.service';
import { formatCurrency } from '@/shared/lib/format';

export type Modo = 'gestao' | 'motorista' | 'oficina';

const CHAVE = ['bookings'] as const;

/** "17/08/2026 às 14:30" */
function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    + ` às ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Para o `datetime-local`, que quer a hora LOCAL sem fuso. */
function paraCampo(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const CLASSE_DO_TOM: Record<string, string> = {
  espera: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ok:     'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  feito:  'bg-muted text-muted-foreground',
  mau:    'bg-destructive/10 text-destructive',
};

function Selo({ status }: { status: BookingStatus }) {
  const e = ESTADOS[status];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CLASSE_DO_TOM[e.tom]}`}>
      {e.rotulo}
    </span>
  );
}

export function BookingsBoard({ modo, titulo }: { modo: Modo; titulo?: string }) {
  const queryClient = useQueryClient();
  const [aberta, setAberta] = useState<Booking | null>(null);
  const [verConcluidas, setVerConcluidas] = useState(false);

  const q = useQuery({
    queryKey: [...CHAVE, verConcluidas],
    queryFn: () => bookingsService.list(verConcluidas ? {} : { abertas: true }),
  });

  const marcacoes = q.data?.bookings ?? [];

  // A marcação aberta é relida da lista: depois de uma acção, o diálogo tem de
  // mostrar o estado novo sem ser fechado e reaberto.
  const atual = aberta ? marcacoes.find((m) => m.id === aberta.id) ?? aberta : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? 'A carregar…'
            : marcacoes.length === 0
              ? (verConcluidas ? 'Nenhuma marcação.' : 'Nada marcado de momento.')
              : `${marcacoes.length} marcação(ões).`}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setVerConcluidas((v) => !v)}>
          {verConcluidas ? 'Ver só as abertas' : 'Ver também o histórico'}
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {!q.isLoading && marcacoes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Wrench className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">{titulo ?? 'Sem marcações'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {modo === 'oficina'
                ? 'Quando a frota marcar alguma coisa, aparece aqui para confirmar.'
                : 'Uma revisão, uns pneus, a inspeção. Marca-se aqui e toda a gente fica a saber.'}
            </p>
          </CardContent>
        </Card>
      )}

      {marcacoes.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {marcacoes.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => setAberta(m)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        <span className="font-mono tracking-tight">{m.vehiclePlate}</span>
                        {' · '}{m.serviceLabel}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {quando(m.status === 'NOVA_DATA_PROPOSTA' && m.proposedAt ? m.proposedAt : m.scheduledAt)}
                        {' · '}{m.workshopName}
                        {modo !== 'motorista' && m.driverName && <> · {m.driverName}</>}
                        {m.needsEscort && <> · precisa de acompanhamento</>}
                      </span>
                    </span>

                    <Selo status={m.status} />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Detalhe
        m={atual}
        modo={modo}
        onFechar={() => setAberta(null)}
        onMudou={() => queryClient.invalidateQueries({ queryKey: CHAVE })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Detalhe({ m, modo, onFechar, onMudou }: {
  m: Booking | null;
  modo: Modo;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [novaHora, setNovaHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const [custo, setCusto] = useState('');
  const [notas, setNotas] = useState('');
  const [novaInspecao, setNovaInspecao] = useState('');
  const [painel, setPainel] = useState<
    '' | 'propor' | 'recusar' | 'concluir' | 'cancelar' | 'anexar' | 'acompanhante'
  >('');
  const [tipoDoFicheiro, setTipoDoFicheiro] = useState<BookingFileKind>('FATURA');
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [erroDoFicheiro, setErroDoFicheiro] = useState('');
  const [acompanhante, setAcompanhante] = useState('');

  function limpar() {
    setNovaHora(''); setMotivo(''); setCusto(''); setNotas(''); setNovaInspecao(''); setPainel('');
    setFicheiro(null); setErroDoFicheiro(''); setAcompanhante('');
  }

  const correu = () => { onMudou(); limpar(); };

  const acao = (fn: () => Promise<unknown>, sucesso: string) => ({
    mutationFn: fn,
    onSuccess: () => { correu(); toast.success(sucesso); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível.'),
  });

  // A mensagem diz quem confirmou. Quando é a gestão a assumir pela oficina,
  // convém ficar claro no momento — é diferente de a oficina ter aceitado, e
  // é essa a distinção que o histórico guarda.
  const confirmar = useMutation(acao(
    () => bookingsService.confirm(m!.id),
    modo === 'gestao'
      ? 'Confirmada pela administração. A oficina foi avisada.'
      : 'Marcação confirmada.',
  ));
  const aceitar = useMutation(acao(
    () => bookingsService.acceptProposal(m!.id), 'Nova hora aceite.',
  ));
  const propor = useMutation(acao(
    () => bookingsService.propose(m!.id, new Date(novaHora).toISOString(), motivo),
    'Proposta enviada.',
  ));
  const recusar = useMutation(acao(
    () => bookingsService.refuse(m!.id, motivo), 'Marcação recusada.',
  ));
  const cancelar = useMutation(acao(
    () => bookingsService.cancel(m!.id, motivo), 'Marcação cancelada.',
  ));
  const concluir = useMutation(acao(
    () => bookingsService.complete(m!.id, {
      cost: custo.trim() === '' ? null : Number(custo),
      notes: notas || null,
      nextInspectionOn: novaInspecao || null,
    }),
    'Marcação concluída.',
  ));
  const anexar = useMutation(acao(
    () => bookingsService.uploadFile(m!.id, tipoDoFicheiro, ficheiro!),
    'Ficheiro anexado.',
  ));
  const apagarFicheiro = useMutation({
    mutationFn: (fileId: string) => bookingsService.removeFile(m!.id, fileId),
    onSuccess: () => { onMudou(); toast.success('Ficheiro removido.'); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível remover.'),
  });
  const designar = useMutation(acao(
    () => bookingsService.assignEscort(m!.id, acompanhante || null),
    'Acompanhamento atualizado.',
  ));

  // Só a gestão pergunta, e só quando precisa: a lista existe para o painel do
  // acompanhante e não tem de ser carregada para abrir uma marcação.
  const escoltasQ = useQuery({
    queryKey: ['bookings', 'escorts'],
    queryFn: () => bookingsService.listEscorts(),
    enabled: modo === 'gestao' && painel === 'acompanhante',
  });

  if (!m) return null;

  const ocupado = [confirmar, aceitar, propor, recusar, cancelar, concluir, anexar, designar]
    .some((x) => x.isPending);

  const ehOficina = modo === 'oficina';
  const ehGestao = modo === 'gestao';
  /** A factura é da oficina e o comprovativo é de quem pagou — o motorista só lê. */
  const podeAnexar = ehGestao || ehOficina;
  const porResponder = m.status === 'PENDENTE' || m.status === 'NOVA_DATA_PROPOSTA';
  const aberta = porResponder || m.status === 'CONFIRMADA';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { limpar(); onFechar(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono tracking-tight">{m.vehiclePlate}</span>
            <span className="text-muted-foreground">·</span>
            <span>{m.serviceLabel}</span>
            <Selo status={m.status} />
          </DialogTitle>
          <DialogDescription>{m.vehicleName}</DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          <Linha icone={CalendarClock} rotulo="Quando">
            {quando(m.scheduledAt)}
          </Linha>

          {m.status === 'NOVA_DATA_PROPOSTA' && m.proposedAt && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="text-sm font-medium">
                A oficina propõe <strong>{quando(m.proposedAt)}</strong>
              </p>
              {m.proposalReason && (
                <p className="mt-0.5 text-xs text-muted-foreground">{m.proposalReason}</p>
              )}
            </div>
          )}

          <Linha icone={MapPin} rotulo="Onde">
            {m.workshopName}
            {m.workshopAddress && <span className="block text-xs text-muted-foreground">{m.workshopAddress}</span>}
          </Linha>

          {m.workshopPhone && (
            <Linha icone={Phone} rotulo="Telefone da oficina">{m.workshopPhone}</Linha>
          )}

          <Linha icone={Car} rotulo="Quem leva o carro">
            {LOGISTICAS[m.logistics]}
          </Linha>

          {m.driverName && (
            <Linha icone={UserPlus} rotulo="Motorista">
              {m.driverName}
              {/* O telefone só aparece a quem precisa de telefonar: a oficina
                  quando o carro não aparece, e a gestão. */}
              {m.driverPhone && modo !== 'motorista' && (
                <span className="block text-xs text-muted-foreground">{m.driverPhone}</span>
              )}
            </Linha>
          )}

          {m.needsEscort && (
            <Linha icone={UserPlus} rotulo="Acompanhamento">
              {m.escortName
                ? <>Vai <strong>{m.escortName}</strong>.</>
                : <span className="text-amber-600 dark:text-amber-400">Pedido, ainda sem ninguém designado.</span>}
            </Linha>
          )}

          {m.description && (
            <Linha icone={FileText} rotulo="O que é preciso">{m.description}</Linha>
          )}

          {m.status === 'CONCLUIDA' && (
            <Linha icone={CheckCircle2} rotulo="Concluída">
              {m.cost !== null ? formatCurrency(m.cost) : 'sem custo registado'}
              {m.completionNotes && (
                <span className="block text-xs text-muted-foreground">{m.completionNotes}</span>
              )}
            </Linha>
          )}

          {/* ── O material da casa ───────────────────────────────────────
              O que a oficina cobrou é só parte da conta: o óleo e os filtros
              saíram da nossa prateleira. Somados, dão o custo a sério desta
              reparação — e é esse que entra no custo do carro.
              O motorista não vê: são preços de compra da frota. */}
          {modo !== 'motorista' && m.materials.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Material da casa
              </p>
              <ul className="space-y-0.5 text-sm">
                {m.materials.map((mt) => (
                  <li key={mt.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {mt.name} <span className="text-muted-foreground">
                        · {mt.qty} {mt.unit}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(mt.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2 text-sm font-medium">
                <span>{m.cost !== null ? 'Oficina + material' : 'Material'}</span>
                <span className="tabular-nums">
                  {formatCurrency((m.cost ?? 0) + m.materialCost)}
                </span>
              </div>
            </div>
          )}

          {m.cancelReason && (
            <Linha icone={Ban} rotulo="Motivo">{m.cancelReason}</Linha>
          )}

          {/* ── A factura e o comprovativo ───────────────────────────────
              Ficam na marcação e não numa pasta à parte: a pergunta que se
              faz três meses depois é "quanto é que custou aquela embraiagem
              e onde está o papel" — e aqui as duas respostas estão juntas.
              O link abre o ficheiro, que é o que "poder verificar" quer
              dizer: ver o documento, não acreditar no número. */}
          {m.files.length > 0 && (
            <div className="pt-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documentos
              </p>
              <ul className="space-y-1">
                {m.files.map((f) => (
                  <li key={f.id} className="flex items-start gap-2">
                    <a
                      href={f.fileUrl} target="_blank" rel="noreferrer"
                      className="inline-flex min-w-0 flex-1 items-start gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        {f.kind === 'FATURA' ? 'Factura'
                          : f.kind === 'COMPROVATIVO' ? 'Comprovativo de pagamento'
                          : 'Documento'}
                        {f.fileName && <span className="text-muted-foreground"> — {f.fileName}</span>}
                        <span className="block text-xs text-muted-foreground">
                          Anexado por {f.uploadedByName ?? 'alguém'} a {quando(f.createdAt)}
                        </span>
                      </span>
                    </a>
                    {podeAnexar && (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Remover ficheiro"
                        disabled={apagarFicheiro.isPending}
                        onClick={() => apagarFicheiro.mutate(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="pt-1 text-xs text-muted-foreground">
            Marcada por {m.createdByName} a {quando(m.createdAt)}.
          </p>
        </dl>

        {/* ── Os painéis que pedem alguma coisa escrita ─────────────────── */}
        {painel === 'propor' && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="bk-hora">Que hora propõe?</Label>
            <Input
              id="bk-hora" type="datetime-local" value={novaHora || paraCampo(m.scheduledAt)}
              onChange={(e) => setNovaHora(e.target.value)}
            />
            <Label htmlFor="bk-motivo-prop">Motivo (opcional)</Label>
            <Textarea
              id="bk-motivo-prop" rows={2} value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: a essa hora não temos elevador livre."
            />
          </div>
        )}

        {(painel === 'recusar' || painel === 'cancelar') && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="bk-motivo">
              Motivo {painel === 'recusar' ? '(obrigatório)' : '(opcional)'}
            </Label>
            <Textarea
              id="bk-motivo" rows={2} value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={painel === 'recusar'
                ? 'Ex.: não fazemos esse serviço.'
                : 'Ex.: o carro já foi reparado noutro sítio.'}
            />
          </div>
        )}

        {painel === 'concluir' && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="bk-custo">Quanto custou (€)</Label>
            <Input
              id="bk-custo" type="number" min="0" step="0.01" inputMode="decimal"
              value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              Deixe vazio se ainda não se sabe. Zero é um custo válido — uma reparação em garantia.
            </p>

            <Label htmlFor="bk-notas">O que foi feito</Label>
            <Textarea
              id="bk-notas" rows={2} value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ex.: óleo e filtros trocados. Pastilhas da frente a precisar na próxima."
            />

            {m.isInspection && (
              <>
                <Label htmlFor="bk-insp">Nova inspeção válida até</Label>
                <Input
                  id="bk-insp" type="date" value={novaInspecao}
                  onChange={(e) => setNovaInspecao(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  É esta data que faz o sistema avisar da próxima. Vem do papel da inspeção.
                </p>
              </>
            )}
          </div>
        )}

        {painel === 'anexar' && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="bk-tipo-ficheiro">O que é este ficheiro</Label>
            <Select
              value={tipoDoFicheiro}
              onValueChange={(v) => setTipoDoFicheiro(v as BookingFileKind)}
            >
              <SelectTrigger id="bk-tipo-ficheiro"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FATURA">Factura da reparação</SelectItem>
                <SelectItem value="COMPROVATIVO">Comprovativo de pagamento</SelectItem>
                <SelectItem value="OUTRO">Outro documento</SelectItem>
              </SelectContent>
            </Select>

            <FilePicker
              id="bk-ficheiro"
              label="Ficheiro"
              hint="JPEG, PNG, WebP ou PDF, até 10 MB."
              file={ficheiro}
              onChange={setFicheiro}
              error={erroDoFicheiro || undefined}
              onError={setErroDoFicheiro}
              disabled={anexar.isPending}
            />
          </div>
        )}

        {painel === 'acompanhante' && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="bk-acompanhante">Quem vai com o motorista</Label>
            <Select value={acompanhante} onValueChange={setAcompanhante}>
              <SelectTrigger id="bk-acompanhante">
                <SelectValue placeholder={escoltasQ.isLoading ? 'A carregar…' : 'Escolha a pessoa'} />
              </SelectTrigger>
              <SelectContent>
                {(escoltasQ.data?.escorts ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A pessoa escolhida e o motorista recebem o aviso com o dia, a hora e a oficina.
            </p>
            {m.escortName && (
              <Button
                type="button" variant="ghost" size="sm" className="text-destructive"
                disabled={ocupado}
                onClick={() => { setAcompanhante(''); designar.mutate(); }}
              >
                Retirar {m.escortName}
              </Button>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={() => { limpar(); onFechar(); }} className="w-full sm:w-auto">
            Fechar
          </Button>

          {/* ── A oficina ─────────────────────────────────────────────── */}
          {ehOficina && porResponder && painel === '' && (
            <>
              <Button className="w-full sm:w-auto" disabled={ocupado} onClick={() => confirmar.mutate()}>
                {confirmar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Confirmar
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPainel('propor')}>
                <Clock className="mr-1.5 h-4 w-4" />Propor outra hora
              </Button>
              <Button variant="outline" className="w-full sm:w-auto text-destructive" onClick={() => setPainel('recusar')}>
                <Ban className="mr-1.5 h-4 w-4" />Recusar
              </Button>
            </>
          )}

          {ehOficina && m.status === 'CONFIRMADA' && painel === '' && (
            <Button className="w-full sm:w-auto" onClick={() => setPainel('concluir')}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />Concluir
            </Button>
          )}

          {/* ── Quem pediu, e a gestão ─────────────────────────────────── */}
          {!ehOficina && m.status === 'NOVA_DATA_PROPOSTA' && painel === '' && (
            <Button className="w-full sm:w-auto" disabled={ocupado} onClick={() => aceitar.mutate()}>
              {aceitar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              Aceitar a nova hora
            </Button>
          )}

          {/* ── A gestão confirma sem esperar pela oficina ─────────────────
              A oficina nem sempre está no sistema: combina-se por telefone, e
              a marcação ficava PENDENTE à espera de uma confirmação que já
              tinha sido dada, só que não aqui.

              Fica em `outline` e não em primário de propósito: o caminho
              normal continua a ser a oficina confirmar. Este é a saída para
              quando ela não o faz. */}
          {ehGestao && porResponder && painel === '' && (
            <Button
              variant="outline" className="w-full sm:w-auto"
              disabled={ocupado}
              onClick={() => confirmar.mutate()}
            >
              {confirmar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              Confirmar pela oficina
            </Button>
          )}

          {ehGestao && m.status === 'CONFIRMADA' && painel === '' && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPainel('concluir')}>
              Concluir
            </Button>
          )}

          {ehGestao && m.needsEscort && aberta && painel === '' && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPainel('acompanhante')}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {m.escortName ? 'Mudar quem acompanha' : 'Designar quem acompanha'}
            </Button>
          )}

          {podeAnexar && painel === '' && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPainel('anexar')}>
              <Paperclip className="mr-1.5 h-4 w-4" />Anexar factura ou comprovativo
            </Button>
          )}

          {!ehOficina && aberta && painel === '' && (
            <Button
              variant="outline" className="w-full text-destructive sm:w-auto"
              onClick={() => setPainel('cancelar')}
            >
              <X className="mr-1.5 h-4 w-4" />Cancelar marcação
            </Button>
          )}

          {/* ── Confirmar o painel aberto ──────────────────────────────── */}
          {painel !== '' && (
            <>
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => limpar()}>
                Voltar
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={ocupado
                  || (painel === 'propor' && !novaHora && !m.scheduledAt)
                  || (painel === 'recusar' && motivo.trim().length === 0)
                  || (painel === 'anexar' && !ficheiro)
                  || (painel === 'acompanhante' && !acompanhante)}
                onClick={() => {
                  if (painel === 'propor') propor.mutate();
                  if (painel === 'recusar') recusar.mutate();
                  if (painel === 'cancelar') cancelar.mutate();
                  if (painel === 'concluir') concluir.mutate();
                  if (painel === 'anexar') anexar.mutate();
                  if (painel === 'acompanhante') designar.mutate();
                }}
              >
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {painel === 'propor' ? 'Enviar proposta'
                  : painel === 'recusar' ? 'Recusar'
                  : painel === 'cancelar' ? 'Cancelar marcação'
                  : painel === 'anexar' ? 'Anexar'
                  : painel === 'acompanhante' ? 'Guardar'
                  : 'Concluir'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ icone: Icone, rotulo, children }: {
  icone: typeof CalendarClock; rotulo: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
        <dd className="text-sm">{children}</dd>
      </div>
    </div>
  );
}
