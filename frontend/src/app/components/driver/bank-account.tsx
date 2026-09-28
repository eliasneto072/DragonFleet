// src/app/components/driver/bank-account.tsx
//
// Contas bancárias do motorista, dentro do Perfil. Até três.
//
// POR QUE AQUI E NÃO EM DOCUMENTOS: a tela de Documentos trata de habilitação —
// cartão de cidadão, carta de condução, certificado TVDE. Um meio de pagamento
// não é um documento de habilitação, e juntá-los faria o motorista procurar o
// IBAN na lista errada. O Perfil já é onde ele altera o email e a palavra-passe;
// as contas para onde recebe pertencem ao mesmo sítio.
//
// OS QUATRO ESTADOS são os que o backend distingue, e cada um responde a uma
// pergunta diferente de quem abre a tela:
//   sem IBAN  → "por que não consigo pedir uma retirada?"
//   pendente  → "já submeti, e agora?"      (mostra o em vigor E o submetido)
//   recusado  → "por que foi recusado?"     (mostra o motivo)
//   em vigor  → "para onde vai o dinheiro?"
//
// ─── TRÊS CONTAS, TRÊS APROVAÇÕES ───────────────────────────────────────────
//
// Cada conta tem o seu próprio ciclo: submete-se com comprovativo, espera
// decisão, entra em vigor. Aprovar uma não aprova as outras — a confiança é por
// conta e não por pessoa.
//
// A PRINCIPAL é a que vem escolhida no pedido de retirada. Só isso: as outras
// continuam a servir, basta escolhê-las na hora.

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { FilePicker } from '@/app/components/ui/file-picker';
import {
  AlertCircle, CheckCircle, Clock, Landmark, Loader2, Plus, Star, Trash2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { bankService, MAX_CONTAS } from '@/shared/services/bank.service';
import { formatIban, isValidIban, normalizeIban } from '@/shared/lib/iban';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterBank } from '@/shared/lib/invalidate';
import type { ApiBankAccount } from '@/shared/types/api';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ── Bloco de leitura de um IBAN ───────────────────────────────────────────────

function IbanBlock({ title, iban, holderName, tone = 'neutral', footnote }: {
  title: string;
  iban: string | null;
  holderName: string | null;
  tone?: 'neutral' | 'active' | 'pending';
  footnote?: string;
}) {
  // Variantes dark: explícitas — bg-*-50 com text-*-700 não invertem sozinhas
  // e no modo escuro dariam texto escuro sobre fundo claro.
  const toneCls =
    tone === 'active'
      ? 'border-brand-100 bg-brand-50 dark:border-emerald-900 dark:bg-emerald-950/40'
      : tone === 'pending'
        ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
        : 'border-border bg-secondary';

  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {/* tabular-nums para os grupos de quatro alinharem ao conferir a olho. */}
      <p className="mt-1 break-all font-mono text-sm tabular-nums">{formatIban(iban)}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{holderName ?? '—'}</p>
      {footnote && <p className="mt-1.5 text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}

// ── Diálogo de submissão ──────────────────────────────────────────────────────

function SubmitBankDialog({ open, onClose, account, outrosIbans }: {
  open: boolean;
  onClose: () => void;
  /** A conta a alterar. Ausente = está a acrescentar uma nova. */
  account?: ApiBankAccount;
  /** Os IBANs das outras contas dele, para avisar antes de enviar. */
  outrosIbans: string[];
}) {
  const queryClient = useQueryClient();

  const [iban, setIban] = useState('');
  const [holderName, setHolderName] = useState('');
  const [label, setLabel] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [proofError, setProofError] = useState('');
  const [ibanError, setIbanError] = useState('');

  // Limpa a cada abertura: um IBAN escrito e abandonado numa tentativa
  // anterior não deve reaparecer meio preenchido na seguinte.
  useEffect(() => {
    if (open) {
      setIban('');
      setHolderName('');
      setLabel(account?.label ?? '');
      setProof(null);
      setProofError('');
      setIbanError('');
    }
  }, [open, account?.label]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => bankService.submit({
      iban: normalizeIban(iban),
      holderName: holderName.trim(),
      label: label.trim() || undefined,
      accountId: account?.id,
      proof: proof!,
    }),
    onSuccess: () => {
      invalidateAfterBank(queryClient);
      toast.success('Dados enviados. Aguardam aprovação da administração.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível enviar os dados.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validar aqui, e não só no servidor, porque a rota envia o comprovativo
    // para o armazenamento ANTES de validar o IBAN: um dígito trocado é
    // recusado depois de o ficheiro já ter subido, e fica lá órfão.
    if (!isValidIban(iban)) {
      setIbanError('IBAN inválido. Confirme o número — um dígito trocado envia o dinheiro para outro sítio.');
      return;
    }
    if (holderName.trim().length < 3) {
      toast.error('Indique o nome do titular da conta.');
      return;
    }
    if (!proof) {
      setProofError('Anexe o comprovativo de titularidade.');
      return;
    }

    // O backend recusa submeter o IBAN que já está em vigor (IBAN_UNCHANGED) e
    // um já registado noutra conta (IBAN_DUPLICATED). Dizê-lo aqui poupa a
    // viagem e o comprovativo enviado para nada.
    const novo = normalizeIban(iban);
    if (account?.iban && normalizeIban(account.iban) === novo) {
      setIbanError('Este já é o IBAN em vigor nesta conta.');
      return;
    }
    if (outrosIbans.some((i) => normalizeIban(i) === novo)) {
      setIbanError('Já tem este IBAN registado noutra das suas contas.');
      return;
    }

    mutate();
  }

  const aAlterar = !!account;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {aAlterar ? 'Alterar esta conta' : 'Acrescentar conta bancária'}
          </DialogTitle>
          <DialogDescription>
            {aAlterar
              ? 'O IBAN atual desta conta continua a valer até a administração aprovar a alteração.'
              : 'A administração valida os dados antes de a conta poder receber dinheiro.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="label">Nome para a conta</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Millennium, conta da empresa…"
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground">
              Só para si distinguir as contas quando pedir uma retirada.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              value={iban}
              onChange={(e) => { setIban(e.target.value); setIbanError(''); }}
              placeholder="PT50 0000 0000 0000 0000 0000 0"
              className="font-mono"
              autoComplete="off"
              required
            />
            {ibanError ? (
              <p className="flex items-start gap-1 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {ibanError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pode escrever com ou sem espaços.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="holderName">Nome do titular</Label>
            <Input
              id="holderName"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Como aparece no banco"
              minLength={3}
              required
            />
          </div>

          <FilePicker
            id="bank-proof"
            label="Comprovativo de titularidade"
            hint="Print do banco ou declaração com o IBAN e o seu nome — JPEG, PNG, WebP ou PDF"
            file={proof}
            onChange={(f) => { setProof(f); if (f) setProofError(''); }}
            error={proofError}
            onError={setProofError}
            disabled={isPending}
          />

          <p className="rounded-lg border border-border bg-secondary p-3 text-xs text-muted-foreground">
            O comprovativo é pedido em cada conta e em cada alteração: a prova
            tem de corresponder ao IBAN que está a submeter.
          </p>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button" variant="outline" onClick={onClose} disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Enviar para aprovação
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Uma conta ─────────────────────────────────────────────────────────────────

function ContaCard({ conta, podeRemover, onAlterar }: {
  conta: ApiBankAccount;
  podeRemover: boolean;
  onAlterar: () => void;
}) {
  const queryClient = useQueryClient();

  const promover = useMutation({
    mutationFn: () => bankService.setPrimary(conta.id),
    onSuccess: () => {
      invalidateAfterBank(queryClient);
      toast.success('Esta passa a ser a conta por omissão.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível mudar a conta principal.'),
  });

  const remover = useMutation({
    mutationFn: () => bankService.archive(conta.id),
    onSuccess: () => {
      invalidateAfterBank(queryClient);
      toast.success('Conta removida.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível remover a conta.'),
  });

  return (
    <div className="rounded-xl border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          {conta.label ?? 'Conta'}
          {conta.isPrimary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Star className="h-3 w-3" aria-hidden="true" />
              Principal
            </span>
          )}
        </p>

        <div className="flex items-center gap-1">
          {!conta.isPrimary && conta.iban && (
            <Button
              variant="ghost" size="sm"
              disabled={promover.isPending}
              onClick={() => promover.mutate()}
            >
              Tornar principal
            </Button>
          )}
          {podeRemover && (
            <Button
              variant="ghost" size="sm"
              disabled={remover.isPending}
              onClick={() => remover.mutate()}
              aria-label="Remover conta"
              title="Remover conta"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {conta.iban && (
          <IbanBlock
            title="IBAN em vigor"
            iban={conta.iban}
            holderName={conta.holderName}
            tone="active"
            footnote={conta.reviewedAt ? `Aprovado a ${formatDateTime(conta.reviewedAt)}` : undefined}
          />
        )}

        {conta.hasPending && (
          <>
            <IbanBlock
              title={conta.iban ? 'Alteração à espera de aprovação' : 'À espera de aprovação'}
              iban={conta.pendingIban}
              holderName={conta.pendingHolderName}
              tone="pending"
              footnote={`Submetido a ${formatDateTime(conta.pendingAt)}`}
            />
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {conta.iban
                ? 'Até a administração decidir, as transferências continuam a ir para o IBAN em vigor acima.'
                : 'Assim que for aprovado, poderá escolher esta conta ao pedir uma retirada.'}
            </p>
          </>
        )}

        {/* Só faz sentido enquanto não há nova submissão: uma submissão nova
            limpa o motivo no servidor, porque ele referia-se aos dados antigos
            e mantê-lo confundiria quem lê. */}
        {conta.rejectionReason && !conta.hasPending && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
            <p className="flex items-start gap-2 text-sm font-medium text-red-800 dark:text-red-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Última submissão recusada
            </p>
            <p className="mt-1 pl-6 text-sm text-red-700 dark:text-red-300">
              {conta.rejectionReason}
            </p>
            <p className="mt-1.5 pl-6 text-xs text-red-700/80 dark:text-red-300/80">
              Corrija o que for necessário e submeta de novo.
            </p>
          </div>
        )}

        {/* Nada a fazer enquanto uma alteração espera decisão: submeter outra
            por cima substituiria a que o administrador está a ver. */}
        {conta.hasPending ? (
          <Button variant="outline" size="sm" disabled className="w-full sm:w-auto">
            <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
            Aguarda aprovação
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onAlterar} className="w-full sm:w-auto">
            Alterar o IBAN desta conta
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Secção ────────────────────────────────────────────────────────────────────

export function BankAccountSection() {
  const queryClient = useQueryClient();
  const [aEditar, setAEditar] = useState<ApiBankAccount | null>(null);
  const [aCriar, setACriar] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.bank.mine,
    queryFn: () => bankService.getMine(),
  });

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-9 w-full sm:w-44" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Dados bancários</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Erro ao carregar os dados bancários.</p>
            <Button
              variant="outline" size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.bank.all })}
            >
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const contas = data.accounts;
  const ibans = contas.map((c) => c.iban).filter((i): i is string => !!i);
  const podeAcrescentar = contas.length < MAX_CONTAS;

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Landmark className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
            Contas bancárias
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Até {MAX_CONTAS} contas. Ao pedir uma retirada, escolhe para qual quer receber.
          </p>
        </CardHeader>

        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {contas.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Ainda não registou uma conta bancária
              </p>
              <p className="mt-1 pl-6 text-sm text-amber-800 dark:text-amber-300">
                Sem IBAN aprovado não é possível pedir retiradas — não haveria
                destino para a transferência.
              </p>
            </div>
          )}

          {contas.map((c) => (
            <ContaCard
              key={c.id}
              conta={c}
              podeRemover={contas.length > 1}
              onAlterar={() => setAEditar(c)}
            />
          ))}

          {podeAcrescentar ? (
            <Button onClick={() => setACriar(true)} className="w-full sm:w-auto">
              {contas.length === 0 ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Registar conta bancária
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Acrescentar outra conta
                </>
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Chegou ao limite de {MAX_CONTAS} contas. Remova uma para acrescentar outra.
            </p>
          )}
        </CardContent>
      </Card>

      <SubmitBankDialog
        open={aCriar || !!aEditar}
        onClose={() => { setACriar(false); setAEditar(null); }}
        account={aEditar ?? undefined}
        outrosIbans={aEditar ? ibans.filter((i) => i !== aEditar.iban) : ibans}
      />
    </>
  );
}
