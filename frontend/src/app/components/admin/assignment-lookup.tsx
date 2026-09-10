// src/app/components/admin/assignment-lookup.tsx
//
// "Quem teve este carro neste dia."
//
// ─── PORQUE É UMA PÁGINA E NÃO UM DIÁLOGO ────────────────────────────────────
//
// Os parâmetros vivem na barra de endereço. Quem consulta isto está a instruir
// um processo de multa ou de acidente, e vai querer colar o link no processo,
// ou mandá-lo a alguém para confirmar. Um diálogo não se cola em lado nenhum, e
// obrigaria a segunda pessoa a repetir a pesquisa de memória — que é a maneira
// mais fácil de duas pessoas obterem respostas diferentes sobre a mesma multa.
//
// Recarregar a página repete a consulta tal e qual. Voltar atrás no browser
// devolve a pesquisa anterior.
//
// ─── O AVISO DE FIABILIDADE NÃO É DECORAÇÃO ──────────────────────────────────
//
// O `startedAt` é gravado no momento em que alguém clica em atribuir, e o
// `endedAt` no momento em que alguém clica em devolver. Nenhum dos dois se
// consegue retroagir. Se o carro voltou na segunda e o registo só foi feito na
// sexta, esta tela responde com a pessoa errada — com o mesmo ar de certeza com
// que responde bem.
//
// Como isto serve para imputar multas e acidentes a pessoas, a tela mostra as
// datas COM AS HORAS e assinala as atribuições ainda abertas. Quem lê fica com
// o material para julgar se confia, em vez de receber um nome e um ponto final.

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Search, Car, AlertCircle, ArrowLeft, Info, Mail, Phone, Loader2, CircleDot,
} from 'lucide-react';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiAssignmentLookup, ApiVehicleAssignment } from '@/shared/types/api';
import { ApiError } from '@/shared/lib/api-client';

/** `2026-03-05` — o formato que o servidor espera e que o <input type="date"> dá. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Data e hora, em português.
 *
 * A HORA aparece de propósito. Num dia em que o carro trocou de mãos, saber
 * que uma atribuição acabou às 11h e outra começou às 12h é a diferença entre
 * uma resposta e um palpite — e a multa tem hora.
 */
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Linha({ atribuicao }: { atribuicao: ApiVehicleAssignment }) {
  const motorista = atribuicao.user;
  const aberta = atribuicao.endedAt === null;

  return (
    <li className="flex flex-col gap-3 border-b border-border p-4 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {motorista?.name ?? 'Motorista removido'}
        </p>

        {/* O contacto é a razão de ser desta tela: quem investiga precisa de
            LIGAR a alguém. O telefone primeiro por ser o caminho rápido; o
            email por baixo, porque é o que existe sempre. */}
        <div className="mt-1.5 space-y-1">
          {motorista?.phone ? (
            <a
              href={`tel:${motorista.phone}`}
              className="flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {motorista.phone}
            </a>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Sem telefone no perfil
            </p>
          )}

          {motorista?.email && (
            <a
              href={`mailto:${motorista.email}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{motorista.email}</span>
            </a>
          )}
        </div>
      </div>

      <div className="shrink-0 text-sm sm:text-right">
        <p className="tabular-nums">
          <span className="text-muted-foreground">De </span>
          {dataHora(atribuicao.startedAt)}
        </p>
        <p className="tabular-nums">
          <span className="text-muted-foreground">Até </span>
          {aberta ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <CircleDot className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              ainda com o carro
            </span>
          ) : (
            dataHora(atribuicao.endedAt!)
          )}
        </p>
      </div>
    </li>
  );
}

function Resultado({ dados }: { dados: ApiAssignmentLookup }) {
  const { vehicle, assignments } = dados;

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardContent className="flex items-center gap-3 p-4">
          <Car className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <Link
              to={`/app/admin/fleet/${vehicle.id}`}
              className="font-medium underline underline-offset-2"
            >
              {vehicle.plate}
            </Link>
            <p className="truncate text-sm text-muted-foreground">
              {vehicle.brand} {vehicle.model} · {vehicle.year}
            </p>
          </div>
        </CardContent>
      </Card>

      {assignments.length === 0 ? (
        // Distinção que importa: isto NÃO é um erro nem uma pesquisa falhada.
        // O carro não estava atribuído a ninguém nesses dias, e isso responde
        // à pergunta em vez de a deixar em aberto.
        <Card className="shadow-card">
          <CardContent className="p-6 text-center">
            <p className="font-medium">Ninguém tinha este carro atribuído.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nas datas consultadas o veículo não estava entregue a nenhum
              motorista. Se a matrícula está certa, a resposta é esta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <ul>
              {assignments.map((a) => <Linha key={a.id} atribuicao={a} />)}
            </ul>
          </CardContent>
        </Card>
      )}

      {assignments.length > 1 && (
        <p className="text-sm text-muted-foreground">
          O carro mudou de mãos dentro do período consultado. As atribuições
          estão por ordem, da mais antiga para a mais recente.
        </p>
      )}

      <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Info className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          As datas acima são as do <strong>registo no sistema</strong>, não as
          da entrega física do carro. Se uma atribuição foi lançada com atraso,
          o período apresentado não corresponde ao real. Confirme com o
          responsável antes de imputar uma multa a alguém.
        </p>
      </div>
    </div>
  );
}

export function AssignmentLookup() {
  // Os parâmetros vivem no URL, e o formulário é apenas o seu reflexo. É por
  // isso que o link é partilhável e que recarregar repete a consulta.
  const [searchParams, setSearchParams] = useSearchParams();

  const plateParam = searchParams.get('plate') ?? '';
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';

  const [plate, setPlate] = useState(plateParam);
  const [from, setFrom] = useState(fromParam || hoje());
  const [to, setTo] = useState(toParam);

  // Alguém colou um link com parâmetros: o formulário passa a mostrá-los, em
  // vez de ficar vazio por baixo de um resultado já preenchido.
  useEffect(() => {
    setPlate(plateParam);
    if (fromParam) setFrom(fromParam);
    setTo(toParam);
  }, [plateParam, fromParam, toParam]);

  const ativa = plateParam !== '' && fromParam !== '';

  const { data, isLoading, isError, error } = useQuery<ApiAssignmentLookup>({
    queryKey: queryKeys.vehicles.lookup(plateParam, fromParam, toParam),
    queryFn: () => vehiclesService.assignmentLookup({
      plate: plateParam,
      from: fromParam,
      to: toParam || undefined,
    }),
    enabled: ativa,
    // Sem repetições automáticas: um 404 de matrícula desconhecida é uma
    // resposta, não uma falha de rede. Tentar três vezes só atrasava o ecrã
    // antes de dizer a mesma coisa.
    retry: false,
  });

  function consultar(e: React.FormEvent) {
    e.preventDefault();
    const q: Record<string, string> = { plate: plate.trim(), from };
    if (to) q.to = to;
    setSearchParams(q);
  }

  const naoEncontrado = isError && error instanceof ApiError && error.status === 404;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Quem teve o carro"
        subtitle="Consultar por matrícula e datas — para multas, coimas e sinistros"
        icon={<Search className="h-5 w-5" />}
        actions={
          <Button variant="outline" asChild>
            <Link to="/app/admin/fleet">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar à frota
            </Link>
          </Button>
        }
      />

      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={consultar} className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="plate">Matrícula</Label>
              <Input
                id="plate"
                placeholder="AA-00-BB"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="from">Data</Label>
              <Input
                id="from" type="date" className="tabular-nums"
                value={from} max={hoje()}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              {/* Opcional de propósito: o caso comum é uma multa num dia. O
                  intervalo serve para quando a hora está na fronteira da
                  meia-noite e não se quer arriscar o dia errado. */}
              <Label htmlFor="to">
                Até <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="to" type="date" className="tabular-nums"
                value={to} min={from} max={hoje()}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Search className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
          </form>
        </CardContent>
      </Card>

      {!ativa && (
        <p className="px-1 text-sm text-muted-foreground">
          Indique a matrícula e a data que constam do aviso. Pode escrevê-la com
          ou sem traços.
        </p>
      )}

      {isLoading && (
        <Card className="shadow-card">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-52" />
          </CardContent>
        </Card>
      )}

      {naoEncontrado && (
        <Card className="shadow-card border-destructive/40">
          <CardContent className="flex gap-3 p-4">
            <AlertCircle className="h-[18px] w-[18px] shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium">Matrícula não encontrada na frota.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nenhum veículo registado com <strong>{plateParam}</strong>.
                Confirme os caracteres — o zero e a letra O trocam-se com
                facilidade.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isError && !naoEncontrado && (
        <Card className="shadow-card border-destructive/40">
          <CardContent className="flex gap-3 p-4">
            <AlertCircle className="h-[18px] w-[18px] shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm">
              {(error as any)?.message ?? 'Não foi possível fazer a consulta.'}
            </p>
          </CardContent>
        </Card>
      )}

      {data && !isLoading && <Resultado dados={data} />}
    </div>
  );
}
