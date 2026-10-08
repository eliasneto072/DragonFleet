// src/app/components/admin/bookings-admin.tsx
//
// As marcações de oficina, do lado da gestão.
//
// ─── PORQUE É QUE SÃO TRÊS ABAS E NÃO TRÊS TELAS ────────────────────────────
//
// As Marcações abrem-se todos os dias. As Oficinas e os Serviços escrevem-se
// uma vez e ficam escritos — mas escrevem-se SEMPRE a partir daqui: é no meio
// de uma marcação que se descobre que falta a oficina nova ou que o serviço
// não está na lista. Em menus separados, essa descoberta obrigava a sair, ir
// procurar, e voltar a começar a marcação do início.
//
// A ordem é a do uso: primeiro o que se faz, depois o que se mantém.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Switch } from '@/app/components/ui/switch';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';
import {
  Building2, KeyRound, Loader2, MapPin, Phone, Plus, UserCog, Wrench, X,
} from 'lucide-react';
import { BookingsBoard } from '@/app/components/shared/bookings-board';
import { BookingForm } from '@/app/components/shared/booking-form';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  bookingsService, TIPOS_DE_OFICINA,
  type Mechanic, type Workshop, type WorkshopKind,
} from '@/features/admin/services/bookings.service';

export function BookingsAdmin() {
  const [aMarcar, setAMarcar] = useState(false);
  const { user } = useAuth();
  // As contas de oficina são chave da casa: só o administrador. O servidor
  // recusa na mesma a quem tentar por fora.
  const ehAdmin = user?.role === 'ADMIN';

  return (
    <Tabs defaultValue="marcacoes" className="space-y-4">
      <TabsList>
        <TabsTrigger value="marcacoes">Marcações</TabsTrigger>
        <TabsTrigger value="oficinas">Oficinas</TabsTrigger>
        <TabsTrigger value="servicos">Serviços</TabsTrigger>
        {ehAdmin && <TabsTrigger value="contas">Contas</TabsTrigger>}
      </TabsList>

      <TabsContent value="marcacoes" className="space-y-4">
        {aMarcar ? (
          <BookingForm
            modo="gestao"
            onPronto={() => setAMarcar(false)}
            onCancelar={() => setAMarcar(false)}
          />
        ) : (
          <Button onClick={() => setAMarcar(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Nova marcação
          </Button>
        )}

        <BookingsBoard modo="gestao" />
      </TabsContent>

      <TabsContent value="oficinas">
        <Oficinas />
      </TabsContent>

      <TabsContent value="servicos">
        <Servicos />
      </TabsContent>

      {ehAdmin && (
        <TabsContent value="contas">
          <ContasDeOficina />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ─── Oficinas ───────────────────────────────────────────────────────────────

function Oficinas() {
  const queryClient = useQueryClient();
  const [aCriar, setACriar] = useState(false);
  const [aEditar, setAEditar] = useState<Workshop | null>(null);

  // `true` traz também as desligadas: é aqui que se voltam a ligar.
  const q = useQuery({
    queryKey: ['bookings', 'workshops', 'todas'],
    queryFn: () => bookingsService.listWorkshops(true),
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['bookings', 'workshops'] });
    queryClient.invalidateQueries({ queryKey: ['bookings', 'workshops', 'todas'] });
  };

  const { mutate: ligar } = useMutation({
    mutationFn: (w: Workshop) => bookingsService.updateWorkshop(w.id, { active: !w.active }),
    onSuccess: () => { invalidar(); toast.success('Oficina atualizada.'); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível atualizar.'),
  });

  const oficinas = q.data?.workshops ?? [];

  return (
    <div className="space-y-4">
      {aCriar || aEditar ? (
        <FormularioDeOficina
          oficina={aEditar}
          onPronto={() => { invalidar(); setACriar(false); setAEditar(null); }}
          onCancelar={() => { setACriar(false); setAEditar(null); }}
        />
      ) : (
        <Button onClick={() => setACriar(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Nova oficina
        </Button>
      )}

      {q.isLoading && <Skeleton className="h-32 w-full rounded-xl" />}

      {!q.isLoading && oficinas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Building2 className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Ainda não há oficinas</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A oficina de sempre, o centro de inspeção, quem põe os pneus. Sem elas
              não há onde marcar.
            </p>
          </CardContent>
        </Card>
      )}

      {oficinas.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {oficinas.map((w) => (
                <li key={w.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {w.name}
                      {!w.active && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          desligada
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TIPOS_DE_OFICINA[w.kind]}
                      {w.address && <> · {w.address}</>}
                      {w.phone && <> · {w.phone}</>}
                    </p>
                    {w.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{w.notes}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setAEditar(w)}>
                      Editar
                    </Button>
                    {/* Desligar e não apagar: as marcações antigas continuam a
                        apontar para ela, e um histórico com a oficina em falta
                        não diz onde o carro esteve. */}
                    <Switch
                      checked={w.active}
                      onCheckedChange={() => ligar(w)}
                      aria-label={w.active ? 'Desligar oficina' : 'Ligar oficina'}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FormularioDeOficina({ oficina, onPronto, onCancelar }: {
  oficina: Workshop | null;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const [name, setName] = useState(oficina?.name ?? '');
  const [kind, setKind] = useState<WorkshopKind>(oficina?.kind ?? 'OFICINA');
  const [address, setAddress] = useState(oficina?.address ?? '');
  const [phone, setPhone] = useState(oficina?.phone ?? '');
  const [notes, setNotes] = useState(oficina?.notes ?? '');

  const { mutate: gravar, isPending } = useMutation({
    mutationFn: () => {
      const dados = {
        name: name.trim(),
        kind,
        address: address.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      };
      return oficina
        ? bookingsService.updateWorkshop(oficina.id, dados)
        : bookingsService.createWorkshop(dados);
    },
    onSuccess: () => { toast.success(oficina ? 'Oficina atualizada.' : 'Oficina criada.'); onPronto(); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível gravar.'),
  });

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{oficina ? 'Editar oficina' : 'Nova oficina'}</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelar} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="of-nome">Nome</Label>
            <Input
              id="of-nome" value={name} maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Oficina do Zé"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="of-tipo">Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as WorkshopKind)}>
              <SelectTrigger id="of-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPOS_DE_OFICINA) as WorkshopKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{TIPOS_DE_OFICINA[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="of-morada">
              <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Morada
            </Label>
            <Input
              id="of-morada" value={address} maxLength={300}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número, localidade"
            />
            <p className="text-xs text-muted-foreground">
              Aparece ao motorista na marcação — é para lá que ele leva o carro.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="of-tel">
              <Phone className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Telefone
            </Label>
            <Input
              id="of-tel" value={phone} maxLength={40}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9xx xxx xxx"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="of-notas">Notas</Label>
            <Textarea
              id="of-notas" rows={2} value={notes} maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: fecha ao sábado. Falar com o Sr. Costa."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => gravar()} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Gravar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tipos de serviço ───────────────────────────────────────────────────────

function Servicos() {
  const queryClient = useQueryClient();
  const [novo, setNovo] = useState('');
  const [ehInspecao, setEhInspecao] = useState(false);

  const q = useQuery({
    queryKey: ['bookings', 'service-types', 'todos'],
    queryFn: () => bookingsService.listServiceTypes(true),
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['bookings', 'service-types'] });
    queryClient.invalidateQueries({ queryKey: ['bookings', 'service-types', 'todos'] });
  };

  const { mutate: criar, isPending } = useMutation({
    mutationFn: () => bookingsService.createServiceType(novo.trim(), ehInspecao),
    onSuccess: ({ serviceType }) => {
      invalidar();
      setNovo(''); setEhInspecao(false);
      toast.success(`"${serviceType.label}" na lista.`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível adicionar.'),
  });

  const { mutate: ligar } = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      bookingsService.setServiceTypeActive(id, active),
    onSuccess: () => { invalidar(); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível atualizar.'),
  });

  const servicos = q.data?.serviceTypes ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acrescentar um serviço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={novo} maxLength={80}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="Ex.: Alinhamento de direção"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && novo.trim()) { e.preventDefault(); criar(); }
              }}
            />
            <Button onClick={() => criar()} disabled={!novo.trim() || isPending} className="shrink-0">
              {isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              Adicionar
            </Button>
          </div>

          {/* ── A caixa da inspeção ──────────────────────────────────────
              Não é uma etiqueta: é o que faz o sistema pedir a nova validade
              ao concluir a marcação, e é dessa data que saem os avisos da
              próxima inspeção. Marcada em "Revisão", passaria a pedir uma
              validade de inspeção a cada mudança de óleo. */}
          <label className="flex cursor-pointer items-start gap-2">
            <Switch checked={ehInspecao} onCheckedChange={setEhInspecao} className="mt-0.5" />
            <span className="text-sm">
              É uma inspeção periódica
              <span className="block text-xs text-muted-foreground">
                Ao concluir, o sistema pede até quando a nova inspeção é válida — e é
                dessa data que saem os avisos da próxima.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {q.isLoading && <Skeleton className="h-32 w-full rounded-xl" />}

      {servicos.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {servicos.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.label}</span>
                    {s.isInspection && (
                      <span className="text-xs text-muted-foreground">
                        pede a validade da nova inspeção
                      </span>
                    )}
                  </span>
                  <Switch
                    checked={s.active}
                    onCheckedChange={(v) => ligar({ id: s.id, active: v })}
                    aria-label={s.active ? `Esconder ${s.label}` : `Mostrar ${s.label}`}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Contas de oficina ──────────────────────────────────────────────────────
//
// ─── PORQUE É QUE A PALAVRA-PASSE SE ESCREVE AQUI ───────────────────────────
//
// Porque não há convite por email para estas contas, e porque é assim que isto
// acontece na vida real: liga-se ao Sr. Costa, combina-se o acesso, e dita-se
// a palavra-passe ao telefone. Ele muda-a depois se quiser.
//
// O que NÃO se faz é guardá-la em lado nenhum deste lado: escreve-se, envia-se,
// e o campo esvazia-se. Quem perder a palavra-passe recebe uma nova — não há
// como recuperar a antiga, e é como deve ser.

function ContasDeOficina() {
  const queryClient = useQueryClient();
  const [aCriar, setACriar] = useState(false);
  const [aTrocarChave, setATrocarChave] = useState<Mechanic | null>(null);

  const q = useQuery({
    queryKey: ['bookings', 'mechanics'],
    queryFn: () => bookingsService.listMechanics(),
  });
  const oficinasQ = useQuery({
    queryKey: ['bookings', 'workshops', 'todas'],
    queryFn: () => bookingsService.listWorkshops(true),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['bookings', 'mechanics'] });

  const { mutate: alterar } = useMutation({
    mutationFn: (v: { id: string; workshopId?: string | null; active?: boolean }) =>
      bookingsService.updateMechanic(v.id, { workshopId: v.workshopId, active: v.active }),
    onSuccess: () => { invalidar(); toast.success('Conta atualizada.'); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível atualizar.'),
  });

  const contas = q.data?.mechanics ?? [];
  const oficinas = oficinasQ.data?.workshops ?? [];

  return (
    <div className="space-y-4">
      {aCriar ? (
        <NovaContaDeOficina
          oficinas={oficinas}
          onPronto={() => { invalidar(); setACriar(false); }}
          onCancelar={() => setACriar(false)}
        />
      ) : (
        <Button onClick={() => setACriar(true)} disabled={oficinas.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Nova conta de oficina
        </Button>
      )}

      {oficinas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Crie primeiro a oficina, na aba ao lado. Uma conta tem de estar ligada a uma.
        </p>
      )}

      {q.isLoading && <Skeleton className="h-32 w-full rounded-xl" />}

      {!q.isLoading && contas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <UserCog className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Ainda não há contas de oficina</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Com uma conta, a oficina entra no site e confirma as marcações ela própria
              — em vez de alguém ter de telefonar a confirmar e a desmarcar.
            </p>
          </CardContent>
        </Card>
      )}

      {contas.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {contas.map((c) => (
                <li key={c.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserCog className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {c.name}
                        {c.status !== 'ACTIVE' && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            sem acesso
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setATrocarChave(c)}>
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Palavra-passe
                      </Button>
                      <Switch
                        checked={c.status === 'ACTIVE'}
                        onCheckedChange={(v) => alterar({ id: c.id, active: v })}
                        aria-label={c.status === 'ACTIVE' ? 'Retirar o acesso' : 'Dar o acesso'}
                      />
                    </div>
                  </div>

                  <div className="pl-12">
                    <Label htmlFor={`conta-of-${c.id}`} className="text-xs text-muted-foreground">
                      Oficina
                    </Label>
                    <Select
                      value={c.workshopId ?? ''}
                      onValueChange={(v) => alterar({ id: c.id, workshopId: v })}
                    >
                      <SelectTrigger id={`conta-of-${c.id}`} className="mt-1 sm:max-w-xs">
                        <SelectValue placeholder="Sem oficina — não vê nada" />
                      </SelectTrigger>
                      <SelectContent>
                        {oficinas.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {aTrocarChave && (
        <NovaPalavraPasse
          conta={aTrocarChave}
          onPronto={() => setATrocarChave(null)}
          onCancelar={() => setATrocarChave(null)}
        />
      )}
    </div>
  );
}

function NovaContaDeOficina({ oficinas, onPronto, onCancelar }: {
  oficinas: Workshop[];
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const [workshopId, setWorkshopId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { mutate: criar, isPending } = useMutation({
    mutationFn: () => bookingsService.createMechanic({
      workshopId, name: name.trim(), email: email.trim(), password,
    }),
    onSuccess: ({ mechanic }) => {
      setPassword('');
      toast.success(`Conta criada para ${mechanic.name}.`);
      onPronto();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível criar a conta.'),
  });

  const completo = !!workshopId && !!name.trim() && !!email.trim() && password.length >= 6;

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Nova conta de oficina</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelar} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mec-oficina">Oficina</Label>
            <Select value={workshopId} onValueChange={setWorkshopId}>
              <SelectTrigger id="mec-oficina"><SelectValue placeholder="Escolha a oficina" /></SelectTrigger>
              <SelectContent>
                {oficinas.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Esta conta só vê as marcações desta oficina.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mec-nome">Nome</Label>
            <Input
              id="mec-nome" value={name} maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Sr. Costa"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mec-email">Email</Label>
            <Input
              id="mec-email" type="email" value={email} autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="oficina@exemplo.pt"
            />
            <p className="text-xs text-muted-foreground">É com este email que ela entra.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mec-pass">Palavra-passe</Label>
            <Input
              id="mec-pass" type="password" value={password} autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
            <p className="text-xs text-muted-foreground">
              Combine-a com a oficina. Depois de gravar não há como a ver outra vez —
              só dar uma nova.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => criar()} disabled={!completo || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Criar conta
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NovaPalavraPasse({ conta, onPronto, onCancelar }: {
  conta: Mechanic;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const [password, setPassword] = useState('');

  const { mutate: gravar, isPending } = useMutation({
    mutationFn: () => bookingsService.updateMechanic(conta.id, { password }),
    onSuccess: () => { setPassword(''); toast.success('Palavra-passe trocada.'); onPronto(); },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível trocar.'),
  });

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Nova palavra-passe · {conta.name}</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelar} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="mec-nova-pass">Palavra-passe</Label>
        <Input
          id="mec-nova-pass" type="password" value={password} autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
        />
        <p className="text-xs text-muted-foreground">
          A anterior deixa de funcionar assim que gravar.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => gravar()} disabled={password.length < 6 || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Gravar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
