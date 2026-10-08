// src/app/components/shared/booking-form.tsx
//
// Marcar uma ida à oficina.
//
// ─── A DIFERENÇA ENTRE OS DOIS PERFIS ───────────────────────────────────────
//
// A gestão escolhe o carro de toda a frota e escolhe quem leva o carro. O
// motorista só vê os carros dele e leva-o sempre — e em vez da escolha da
// logística tem uma caixa para pedir acompanhamento.
//
// Isso não é uma simplificação do ecrã: é a regra. Mandar a oficina buscar o
// carro é uma despesa, e é a empresa que a decide. O servidor recusa na mesma
// se alguém tentar por fora.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import {
  bookingsService, LOGISTICAS, type BookingLogistics,
} from '@/features/admin/services/bookings.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';

/** Daqui a uma hora, arredondado — o valor inicial do campo. */
function daquiAUmaHora(): string {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

export function BookingForm({ modo, onPronto, onCancelar }: {
  modo: 'gestao' | 'motorista';
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const queryClient = useQueryClient();

  const [vehicleId, setVehicleId] = useState('');
  const [workshopId, setWorkshopId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [quando, setQuando] = useState(daquiAUmaHora());
  const [descricao, setDescricao] = useState('');
  const [logistics, setLogistics] = useState<BookingLogistics>('MOTORISTA_LEVA');
  const [needsEscort, setNeedsEscort] = useState(false);
  const [novoServico, setNovoServico] = useState('');
  const [aAdicionar, setAAdicionar] = useState(false);

  const carrosQ = useQuery({
    queryKey: ['vehicles', 'para-marcacao', modo],
    queryFn: () => vehiclesService.list(),
  });
  const carros = useMemo(() => {
    const todos = (carrosQ.data as any)?.vehicles ?? [];
    // O servidor já devolve só os do motorista quando é ele a perguntar; esta
    // ordenação é só para a lista não vir baralhada.
    return [...todos].sort((a: any, b: any) => (a.plate ?? '').localeCompare(b.plate ?? ''));
  }, [carrosQ.data]);

  const oficinasQ = useQuery({
    queryKey: ['bookings', 'workshops'],
    queryFn: () => bookingsService.listWorkshops(),
  });
  const servicosQ = useQuery({
    queryKey: ['bookings', 'service-types'],
    queryFn: () => bookingsService.listServiceTypes(),
  });

  const { mutate: adicionarServico, isPending: aGravarServico } = useMutation({
    mutationFn: (label: string) => bookingsService.createServiceType(label),
    onSuccess: ({ serviceType }) => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'service-types'] });
      setServiceTypeId(serviceType.id);
      setNovoServico('');
      setAAdicionar(false);
      toast.success(`"${serviceType.label}" adicionado.`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível adicionar.'),
  });

  const { mutate: marcar, isPending } = useMutation({
    mutationFn: () => bookingsService.create({
      vehicleId,
      workshopId,
      serviceTypeId,
      // O campo dá hora LOCAL sem fuso; o `new Date` interpreta-a como local e
      // o ISO leva o fuso correcto para o servidor.
      scheduledAt: new Date(quando).toISOString(),
      description: descricao.trim() || null,
      logistics: modo === 'motorista' ? 'MOTORISTA_LEVA' : logistics,
      needsEscort,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Marcação enviada à oficina.');
      onPronto();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível marcar.'),
  });

  const completo = !!vehicleId && !!workshopId && !!serviceTypeId && !!quando;

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Nova marcação</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelar} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bf-carro">Carro</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="bf-carro"><SelectValue placeholder="Escolha o carro" /></SelectTrigger>
              <SelectContent>
                {carros.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.plate} — {c.brand} {c.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bf-oficina">Onde</Label>
            <Select value={workshopId} onValueChange={setWorkshopId}>
              <SelectTrigger id="bf-oficina"><SelectValue placeholder="Escolha a oficina" /></SelectTrigger>
              <SelectContent>
                {(oficinasQ.data?.workshops ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bf-servico">O que é</Label>
            {!aAdicionar ? (
              <div className="flex gap-2">
                <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                  <SelectTrigger id="bf-servico" className="flex-1">
                    <SelectValue placeholder="Escolha o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {(servicosQ.data?.serviceTypes ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {modo === 'gestao' && (
                  <Button type="button" variant="outline" onClick={() => setAAdicionar(true)}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Novo
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={novoServico} maxLength={80} autoFocus
                  onChange={(e) => setNovoServico(e.target.value)}
                  placeholder="Ex.: Alinhamento de direção"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novoServico.trim()) {
                      e.preventDefault(); adicionarServico(novoServico.trim());
                    }
                  }}
                />
                <Button
                  type="button" disabled={!novoServico.trim() || aGravarServico}
                  onClick={() => adicionarServico(novoServico.trim())}
                >
                  {aGravarServico ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setAAdicionar(false); setNovoServico(''); }}>
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bf-quando">Dia e hora</Label>
            <Input
              id="bf-quando" type="datetime-local" value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A oficina confirma ou propõe outra hora.
            </p>
          </div>

          {modo === 'gestao' ? (
            <div className="space-y-1.5">
              <Label htmlFor="bf-logistica">Quem leva o carro</Label>
              <Select value={logistics} onValueChange={(v) => setLogistics(v as BookingLogistics)}>
                <SelectTrigger id="bf-logistica"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LOGISTICAS) as BookingLogistics[]).map((k) => (
                    <SelectItem key={k} value={k}>{LOGISTICAS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Quem leva o carro</Label>
              <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                Leva o carro você. Se precisar de alguém da empresa consigo, peça em baixo.
              </p>
            </div>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bf-descricao">O que é preciso fazer</Label>
            <Textarea
              id="bf-descricao" rows={2} value={descricao} maxLength={2000}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: barulho na suspensão à frente quando passa em lombas."
            />
            <p className="text-xs text-muted-foreground">É isto que a oficina vai ler.</p>
          </div>

          {/* ── O acompanhamento ──────────────────────────────────────────
              Existe por uma razão concreta: há carros em nome da empresa que
              são dos motoristas, e certas coisas exigem lá um responsável da
              empresa por eles não serem os donos no papel. */}
          <label className="flex cursor-pointer items-start gap-2 sm:col-span-2">
            <Checkbox
              checked={needsEscort}
              onCheckedChange={(v) => setNeedsEscort(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              Preciso que vá alguém da empresa comigo
              <span className="block text-xs text-muted-foreground">
                Para o que exigir um responsável da empresa — o carro está em nome dela.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => marcar()} disabled={!completo || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Marcar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
