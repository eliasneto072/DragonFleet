// src/app/components/admin/invites-dialog.tsx
//
// Convidar motoristas: gerar o link, copiá-lo, e cancelar os que já não servem.
//
// ─── PORQUE É QUE ISTO NÃO É UMA ENTRADA DE MENU ────────────────────────────
//
// Porque não é um sítio onde se trabalha — é uma coisa que se faz a partir da
// tela dos Motoristas, que é onde a pessoa já está quando pensa "preciso de
// inscrever o João". Uma entrada no menu lateral para isto seria uma entrada
// aberta duas vezes por mês, a ocupar espaço ao lado das que se abrem todos os
// dias. E obrigava a mexer no catálogo dos planos, para dar acesso a um menu
// que ninguém pediu.
//
// ─── O LINK É O SEGREDO, E É POR ISSO QUE SE COPIA E NÃO SE DECORA ──────────
//
// O código é a chave da porta: quem o tem entra. Daí o botão de copiar em vez
// de um campo para o ler, e daí o aviso de que um link que corra por aí
// inscreve quem quiser — até ao limite e à validade que foram escolhidos, que
// é exactamente para isso que eles existem.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban, Check, Copy, Link2, Loader2, Plus, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import {
  invitesService, linkDoConvite, type Convite, type EstadoDoConvite,
} from '@/features/admin/services/invites.service';

/** Valor do Select para "sem validade". O Select não aceita `null`. */
const SEM_VALIDADE = 'sem';

const ROTULO_DO_ESTADO: Record<EstadoDoConvite, { texto: string; cls: string }> = {
  valido: { texto: 'Activo', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  expirado: { texto: 'Expirado', cls: 'bg-secondary text-muted-foreground' },
  esgotado: { texto: 'Esgotado', cls: 'bg-secondary text-muted-foreground' },
  revogado: { texto: 'Cancelado', cls: 'bg-secondary text-muted-foreground' },
};

/** Quantos lugares faltam, por palavras. */
function lugares(c: Convite): string {
  if (c.maxUses === null) return `${c.usos} usados · sem limite`;
  return `${c.usos} de ${c.maxUses} usados`;
}

function BotaoCopiar({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const link = linkDoConvite(codigo);
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      // Volta ao normal sozinho: um botão que fica "Copiado!" para sempre
      // deixa de dizer se o segundo toque funcionou.
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão para a área de transferência (acontece em http e em
      // alguns telemóveis). Mostrar o link é melhor do que não fazer nada.
      toast.info(link, { duration: 15000, description: 'Copie o link à mão.' });
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copiar}>
      {copiado
        ? <><Check className="h-4 w-4 mr-1.5 text-emerald-600" />Copiado</>
        : <><Copy className="h-4 w-4 mr-1.5" />Copiar link</>}
    </Button>
  );
}

// ── Criar ────────────────────────────────────────────────────────────────────

function Criar({ validades }: { validades: { dias: number | null; nome: string }[] }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [label, setLabel] = useState('');
  const [validade, setValidade] = useState('30');
  const [limite, setLimite] = useState('');

  const m = useMutation({
    mutationFn: () => invitesService.create({
      label: label.trim() || null,
      dias: validade === SEM_VALIDADE ? null : Number(validade),
      // Em branco quer dizer sem limite, e é uma escolha e não um esquecimento
      // — daí `null` explícito.
      maxUses: limite.trim() ? Number(limite) : null,
    }),
    onSuccess: async (r) => {
      qc.invalidateQueries({ queryKey: queryKeys.invites.all });
      setAberto(false);
      setLabel(''); setLimite('');
      // Copiado logo: a razão de se criar um convite é mandá-lo a alguém, e o
      // passo seguinte era sempre o mesmo clique.
      try {
        await navigator.clipboard.writeText(linkDoConvite(r.convite.codigo));
        toast.success('Convite criado e link copiado.');
      } catch {
        toast.success('Convite criado. Use "Copiar link" na lista.');
      }
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível criar o convite.'),
  });

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Novo convite
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-2">
        <Label>Para que é este link</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Grupo do WhatsApp, motoristas de outubro…"
        />
        <p className="text-xs text-muted-foreground">
          Só para te lembrares. O motorista não vê isto.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Validade</Label>
          <Select value={validade} onValueChange={setValidade}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {validades.map((v) => (
                <SelectItem key={v.nome} value={v.dias === null ? SEM_VALIDADE : String(v.dias)}>
                  {v.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Quantas pessoas</Label>
          <Input
            type="number" min={1}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            placeholder="Sem limite"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Quem tiver o link inscreve-se nesta frota, até ao limite e à validade
        que escolheste. Podes cancelá-lo a qualquer momento.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Criar e copiar
        </Button>
      </div>
    </div>
  );
}

// ── O diálogo ────────────────────────────────────────────────────────────────

export function InvitesDialog({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: queryKeys.invites.list,
    queryFn: () => invitesService.list(),
    enabled: aberto,
  });

  const revogar = useMutation({
    mutationFn: (id: string) => invitesService.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.invites.all });
      toast.success('Convite cancelado. O link deixou de abrir.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível cancelar.'),
  });

  const convites = q.data?.convites ?? [];
  const validades = q.data?.validades ?? [{ dias: 30, nome: '30 dias' }];

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convidar motoristas</DialogTitle>
          <DialogDescription>
            O motorista inscreve-se pelo link e a conta nasce já nesta frota —
            não há registo aberto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Criar validades={validades} />

          {q.isLoading && <Skeleton className="h-24 w-full" />}

          {!q.isLoading && convites.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Ainda não há convites. Cria um e envia o link.
            </p>
          )}

          <div className="space-y-2">
            {convites.map((c) => {
              const r = ROTULO_DO_ESTADO[c.estado];
              return (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 space-y-2 ${
                    c.estado === 'valido' ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <code className="text-sm font-mono">{c.codigo}</code>
                        <Badge className={r.cls} variant="secondary">{r.texto}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.label ? `${c.label} · ` : ''}
                        {lugares(c)}
                        {c.validoAte ? ` · até ${formatDate(c.validoAte)}` : ' · sem validade'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Copiar e cancelar só fazem sentido num que vale. Num
                          expirado, copiar o link era dar a alguém um link que
                          não abre. */}
                      {c.estado === 'valido' && (
                        <>
                          <BotaoCopiar codigo={c.codigo} />
                          <Button
                            variant="ghost" size="sm" title="Cancelar este convite"
                            onClick={() => revogar.mutate(c.id)}
                            disabled={revogar.isPending}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O botão que abre tudo isto. Vive no cabeçalho dos Motoristas. */
export function BotaoConvidar() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <UserPlus className="h-4 w-4 mr-2" />
        Convidar
      </Button>
      <InvitesDialog aberto={aberto} onClose={() => setAberto(false)} />
    </>
  );
}
