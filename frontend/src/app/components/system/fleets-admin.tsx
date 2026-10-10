// src/app/components/system/fleets-admin.tsx
//
// As frotas clientes: quem são, em que plano estão, e até quando está pago.
//
// ─── O QUE ESTA TELA TEM DE RESPONDER NUM OLHAR ─────────────────────────────
//
// "Alguém vai ficar trancado esta semana?" É a única pergunta aqui com prazo, e
// por isso é a que manda na ordem: as assinaturas a acabar e as expiradas vêm
// primeiro, e só depois as que estão em dia. Uma lista por ordem alfabética
// obrigava a percorrê-la toda, todos os dias, à procura de nada.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, CalendarClock, CircleSlash, Loader2, Pencil, Plus, RefreshCw, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Switch } from '@/app/components/ui/switch';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import { StatsCard } from '@/app/components/stats-card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency, formatDate } from '@/shared/lib/format';
import {
  systemService, textoDaAssinatura, DURACOES,
  type FrotaNaLista, type Plano,
} from '@/features/system/services/system.service';

/** Valor do Select quando não se escolhe plano. O Select não aceita "". */
const SEM_PLANO = 'nenhum';

const CLASSE_DO_TOM: Record<string, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  aviso: 'text-amber-600 dark:text-amber-400 font-semibold',
  mau: 'text-destructive font-semibold',
  neutro: 'text-muted-foreground',
};

/**
 * A ordem da lista: primeiro quem tem prazo a correr.
 *
 * Expiradas, a acabar, em dia, e por fim as que não pagam (a da casa). Dentro
 * de cada grupo, quem acaba primeiro aparece primeiro.
 */
const PESO: Record<string, number> = {
  expirada: 0, termina_em_breve: 1, activa: 2, sem_assinatura: 3,
};

function ordenar(frotas: FrotaNaLista[]): FrotaNaLista[] {
  return [...frotas].sort((a, b) => {
    const pa = PESO[a.assinatura.estado] ?? 9;
    const pb = PESO[b.assinatura.estado] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.assinatura.dias ?? 0) - (b.assinatura.dias ?? 0);
  });
}

// ── Criar uma frota ──────────────────────────────────────────────────────────

function NovaFrotaDialog({
  planos, aberto, onClose,
}: { planos: Plano[]; aberto: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nome: '', nif: '', telefone: '', email: '', notas: '',
    planoId: SEM_PLANO, dias: '',
    gestorNome: '', gestorEmail: '', gestorPassword: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const plano = planos.find((p) => p.id === f.planoId);

  const m = useMutation({
    mutationFn: () => systemService.criarFrota({
      nome: f.nome.trim(),
      nif: f.nif.trim() || null,
      telefone: f.telefone.trim() || null,
      email: f.email.trim() || null,
      notas: f.notas.trim() || null,
      planoId: f.planoId === SEM_PLANO ? null : f.planoId,
      // Vazio quer dizer "a duração do plano". O servidor decide, para não
      // haver duas contas da mesma coisa em dois sítios.
      ...(f.dias.trim() ? { dias: Number(f.dias) } : {}),
      gestor: {
        nome: f.gestorNome.trim(),
        email: f.gestorEmail.trim(),
        password: f.gestorPassword,
      },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success(`Frota criada. A conta de ${r.gestor.email} já pode entrar.`);
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível criar a frota.'),
  });

  const podeGravar = f.nome.trim().length >= 2
    && f.gestorNome.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.gestorEmail.trim())
    && f.gestorPassword.length >= 8;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova frota</DialogTitle>
          <DialogDescription>
            A frota e a primeira conta nascem juntas — uma frota sem conta é uma
            frota onde ninguém entra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input
              value={f.nome}
              onChange={(e) => set('nome', e.target.value)}
              placeholder="Transportes Silva, Lda."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>NIF</Label>
              <Input value={f.nif} onChange={(e) => set('nif', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={f.telefone} onChange={(e) => set('telefone', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email da empresa</Label>
            <Input
              type="email"
              value={f.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="geral@empresa.pt"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={f.planoId} onValueChange={(v) => set('planoId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PLANO}>Sem plano</SelectItem>
                  {planos.filter((p) => p.activo).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} — {formatCurrency(p.preco)} / {p.duracaoDias} dias
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dias a dar já</Label>
              <Input
                type="number"
                min={0}
                value={f.dias}
                onChange={(e) => set('dias', e.target.value)}
                placeholder={plano ? String(plano.duracaoDias) : '0'}
              />
              <p className="text-xs text-muted-foreground">
                {plano
                  ? `Em branco dá os ${plano.duracaoDias} dias do plano.`
                  : 'Sem plano e sem dias, a frota fica criada e por activar.'}
              </p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium">
              A primeira conta — o administrador desta frota
            </p>

            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={f.gestorNome} onChange={(e) => set('gestorNome', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={f.gestorEmail}
                onChange={(e) => set('gestorEmail', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Palavra-passe inicial</Label>
              <Input
                type="password"
                value={f.gestorPassword}
                onChange={(e) => set('gestorPassword', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Oito caracteres, no mínimo. Combine-a com o cliente e peça-lhe
                que a mude no perfil.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas (só para ti)</Label>
            <Textarea
              rows={2}
              value={f.notas}
              onChange={(e) => set('notas', e.target.value)}
              placeholder="Desconto combinado, condições, quem apresentou..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!podeGravar || m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar frota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Editar uma frota ─────────────────────────────────────────────────────────

function EditarFrotaDialog({
  frota, planos, onClose,
}: { frota: FrotaNaLista | null; planos: Plano[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    nome: frota?.nome ?? '',
    nif: frota?.nif ?? '',
    telefone: frota?.telefone ?? '',
    email: frota?.email ?? '',
    notas: frota?.notas ?? '',
    planoId: frota?.plano?.id ?? SEM_PLANO,
    activa: frota?.activa ?? true,
  }));
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const m = useMutation({
    mutationFn: () => systemService.actualizarFrota(frota!.id, {
      nome: f.nome.trim(),
      nif: f.nif.trim() || null,
      telefone: f.telefone.trim() || null,
      email: f.email.trim() || null,
      notas: f.notas.trim() || null,
      planoId: f.planoId === SEM_PLANO ? null : f.planoId,
      activa: f.activa,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success('Frota actualizada.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível guardar.'),
  });

  if (!frota) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{frota.nome}</DialogTitle>
          <DialogDescription>
            Endereço curto: <code>{frota.slug}</code> — não muda, para não
            quebrar os convites já enviados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input value={f.nome} onChange={(e) => set('nome', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>NIF</Label>
              <Input value={f.nif} onChange={(e) => set('nif', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={f.telefone} onChange={(e) => set('telefone', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email da empresa</Label>
            <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={f.planoId} onValueChange={(v) => set('planoId', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PLANO}>Sem plano</SelectItem>
                {planos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}{p.activo ? '' : ' (arquivado)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notas (só para ti)</Label>
            <Textarea rows={3} value={f.notas} onChange={(e) => set('notas', e.target.value)} />
          </div>

          {/* A frota da casa não se desliga: desligá-la era trancar-se a si
              próprio fora de tudo, este painel incluído. */}
          {!frota.daCasa && (
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <p className="text-sm font-medium">Frota ligada</p>
                <p className="text-xs text-muted-foreground">
                  Desligada, ninguém desta frota entra — e os dados ficam todos.
                </p>
              </div>
              <Switch
                checked={f.activa}
                onCheckedChange={(v) => set('activa', v)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Renovar ──────────────────────────────────────────────────────────────────

function RenovarDialog({
  frota, onClose,
}: { frota: FrotaNaLista | null; onClose: () => void }) {
  const qc = useQueryClient();
  const doPlano = frota?.plano ? 'plano' : String(DURACOES[0].dias);
  const [escolha, setEscolha] = useState(doPlano);
  const [medida, setMedida] = useState('');

  const m = useMutation({
    mutationFn: () => systemService.renovar(
      frota!.id,
      escolha === 'plano' ? undefined
        : escolha === 'medida' ? Number(medida)
        : Number(escolha),
    ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success(`Renovada até ${formatDate(r.frota.terminaEm ?? '')}.`);
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível renovar.'),
  });

  if (!frota) return null;

  const estado = textoDaAssinatura(frota.assinatura);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar {frota.nome}</DialogTitle>
          <DialogDescription>
            {frota.assinatura.estado === 'expirada'
              // A regra está no servidor (`assinatura.ts`) e é dita aqui por
              // escrito: é a conta que todos fazem de cabeça, e assim não há
              // conversa sobre porque é que a data é aquela.
              ? 'Está expirada, por isso os dias novos contam a partir de hoje — '
                + 'não se paga o tempo em que esteve parada.'
              : 'Está dentro do prazo, por isso os dias novos somam-se ao fim '
                + 'que já tinha — nada se perde por renovar mais cedo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            Agora: <span className={CLASSE_DO_TOM[estado.tom]}>{estado.texto}</span>
            {frota.terminaEm && (
              <span className="text-muted-foreground"> · até {formatDate(frota.terminaEm)}</span>
            )}
          </p>

          <div className="space-y-2">
            <Label>Quanto tempo</Label>
            <Select value={escolha} onValueChange={setEscolha}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {frota.plano && (
                  <SelectItem value="plano">
                    {frota.plano.nome} — {frota.plano.duracaoDias} dias
                    {' '}({formatCurrency(frota.plano.preco)})
                  </SelectItem>
                )}
                {DURACOES.map((d) => (
                  <SelectItem key={d.dias} value={String(d.dias)}>
                    {d.nome} ({d.dias} dias)
                  </SelectItem>
                ))}
                <SelectItem value="medida">À medida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {escolha === 'medida' && (
            <div className="space-y-2">
              <Label>Quantos dias</Label>
              <Input
                type="number"
                min={1}
                value={medida}
                onChange={(e) => setMedida(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || (escolha === 'medida' && Number(medida) < 1)}
          >
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Renovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── As contas de uma frota ───────────────────────────────────────────────────

function ContasDialog({
  frota, onClose,
}: { frota: FrotaNaLista | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: queryKeys.sistema.contas(frota?.id ?? ''),
    queryFn: () => systemService.contas(frota!.id),
    enabled: !!frota,
  });

  if (!frota) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quem tem as chaves — {frota.nome}</DialogTitle>
          <DialogDescription>
            As contas de administração desta frota. É o que responde à chamada
            "ninguém consegue entrar".
          </DialogDescription>
        </DialogHeader>

        {q.isLoading && <Skeleton className="h-24 w-full" />}

        {q.data && (
          <div className="space-y-2">
            {q.data.contas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta de administração. Esta frota não tem por onde entrar.
              </p>
            )}
            {q.data.contas.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{c.role}</Badge>
                  {c.status !== 'ACTIVE' && <Badge variant="destructive">{c.status}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────

export function FleetsAdmin() {
  const [nova, setNova] = useState(false);
  const [aEditar, setAEditar] = useState<FrotaNaLista | null>(null);
  const [aRenovar, setARenovar] = useState<FrotaNaLista | null>(null);
  const [aVerContas, setAVerContas] = useState<FrotaNaLista | null>(null);

  const painelQ = useQuery({
    queryKey: queryKeys.sistema.painel,
    queryFn: () => systemService.painel(),
  });
  const planosQ = useQuery({
    queryKey: queryKeys.sistema.planos,
    queryFn: () => systemService.planos(),
  });

  const frotas = useMemo(
    () => ordenar(painelQ.data?.frotas ?? []),
    [painelQ.data?.frotas],
  );
  const planos = planosQ.data?.planos ?? [];
  const resumo = painelQ.data?.resumo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Frotas"
        subtitle="Os clientes da plataforma, o plano de cada um e até quando está pago."
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <Button onClick={() => setNova(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova frota
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Frotas" value={String(resumo?.frotas ?? 0)}
          description="A tua incluída"
          icon={<Building2 />}
        />
        <StatsCard
          title="Ligadas" value={String(resumo?.activas ?? 0)}
          icon={<Users />}
        />
        <StatsCard
          title="A acabar" value={String(resumo?.aExpirar ?? 0)}
          description="Nos próximos 7 dias"
          icon={<CalendarClock />}
        />
        <StatsCard
          title="Expiradas" value={String(resumo?.expiradas ?? 0)}
          description="Trancadas à espera de renovar"
          icon={<CircleSlash />}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {painelQ.isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Frota</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Assinatura</TableHead>
                  <TableHead className="text-right">Motoristas</TableHead>
                  <TableHead className="text-right">Carros</TableHead>
                  <TableHead className="text-right">Equipa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {frotas.map((f) => {
                  const estado = textoDaAssinatura(f.assinatura);
                  return (
                    <TableRow key={f.id} className={f.activa ? '' : 'opacity-60'}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{f.nome}</span>
                          {f.daCasa && <Badge variant="secondary">Casa</Badge>}
                          {!f.activa && <Badge variant="destructive">Desligada</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {f.slug}
                          {f.nif ? ` · NIF ${f.nif}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        {f.plano ? (
                          <>
                            <span className="text-sm">{f.plano.nome}</span>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(f.plano.preco)} / {f.plano.duracaoDias} dias
                            </p>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm ${CLASSE_DO_TOM[estado.tom]}`}>
                          {estado.texto}
                        </span>
                        {f.terminaEm && (
                          <p className="text-xs text-muted-foreground">
                            até {formatDate(f.terminaEm)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{f.contagens.motoristas}</TableCell>
                      <TableCell className="text-right">{f.contagens.veiculos}</TableCell>
                      <TableCell className="text-right">{f.contagens.equipa}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setAVerContas(f)}
                          title="Quem tem as chaves desta frota"
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        {/* A frota da casa não paga a ninguém: renovar nela não
                            quer dizer nada. */}
                        {!f.daCasa && (
                          <Button variant="ghost" size="sm" onClick={() => setARenovar(f)} title="Renovar">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setAEditar(f)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NovaFrotaDialog planos={planos} aberto={nova} onClose={() => setNova(false)} />
      {/* A chave força o diálogo a nascer de novo por frota: sem ela, o estado
          inicial do formulário era o da frota aberta na primeira vez. */}
      {aEditar && (
        <EditarFrotaDialog
          key={aEditar.id} frota={aEditar} planos={planos}
          onClose={() => setAEditar(null)}
        />
      )}
      {aRenovar && (
        <RenovarDialog key={aRenovar.id} frota={aRenovar} onClose={() => setARenovar(null)} />
      )}
      {aVerContas && (
        <ContasDialog key={aVerContas.id} frota={aVerContas} onClose={() => setAVerContas(null)} />
      )}
    </div>
  );
}
