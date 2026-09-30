// src/app/components/admin/expense-import.tsx
//
// Fechar a semana a partir dos três PDFs dos portais.
//
// ═══ O TRABALHO QUE ISTO SUBSTITUI ══════════════════════════════════════════
//
// Abrir o extrato da Via Verde e somar por matrícula à mão. Abrir o MyPrio do
// combustível e somar. Abrir o dos carregamentos e somar. Escrever tudo, carro
// a carro, num fecho por motorista. Uma hora por semana, e os erros de conta só
// aparecem quando alguém reclama.
//
// ─── DUAS FASES, E A PRIMEIRA NÃO GRAVA ─────────────────────────────────────
//
// Primeiro "Analisar": mostra o que vai ser criado, em quem, e todos os avisos.
// Só depois "Criar rascunhos".
//
// A pré-visualização existe porque o erro mais provável aqui não é de software:
// é exportar a semana errada de um dos portais. Descobrir isso depois de
// catorze rascunhos criados custa mais do que um clique a mais.
//
// ─── A SEMANA DA VIA VERDE NÃO É A DO FECHO ─────────────────────────────────
//
// O portal da Via Verde tem 4 a 5 dias de atraso a publicar movimentos. Para
// fechar 12 a 18 de outubro, o extrato a exportar é o de 5 a 11.
//
// O ecrã CALCULA e mostra essa data, em vez de a deixar de fora e confiar na
// memória de quem está a usar. É a única forma de o aviso servir para algo: a
// conta de menos sete dias é fácil de fazer e fácil de esquecer, e o resultado
// de a esquecer é uma semana fechada com as portagens de outra.
//
// ─── NADA É CREDITADO ───────────────────────────────────────────────────────
//
// Tudo nasce em rascunho. O crédito continua a ser um clique humano no painel
// da faturação, como sempre foi.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BatteryCharging, CheckCircle2, FileUp, Fuel,
  Loader2, Receipt, Upload, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import {
  fleetImportService, ficheiroParaBase64,
  type ResultadoAnalise, type ResultadoImportacao,
} from '@/features/admin/services/fleet-import.service';
import { formatCurrency } from '@/shared/lib/format';
import { ApiError } from '@/shared/lib/api-client';

// ─────────────────────────────────────────────────────────────────────────────

/** A segunda-feira da semana passada, em "YYYY-MM-DD". */
function segundaPassada(): string {
  const hoje = new Date();
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  // getUTCDay: 0 é domingo. Recua até à segunda e depois mais sete dias.
  const paraSegunda = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - paraSegunda - 7);
  return d.toISOString().slice(0, 10);
}

function maisDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dia;
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-12" → "12/10". Para caber nas frases sem as encher de anos. */
function curto(dia: string): string {
  const [, m, d] = dia.split('-');
  return m && d ? `${d}/${m}` : dia;
}

type Campo = 'viaVerde' | 'prioFrota' | 'prioElectric';

const FICHEIROS: Array<{
  campo: Campo;
  titulo: string;
  onde: string;
  Icone: typeof Receipt;
}> = [
  {
    campo: 'viaVerde',
    titulo: 'Via Verde — portagens',
    onde: 'Consultar extratos › Movimentos › filtrar a semana › Exportar PDF',
    Icone: Receipt,
  },
  {
    campo: 'prioFrota',
    titulo: 'Prio — combustível',
    onde: 'myprio.com › Transactions › exportar PDF',
    Icone: Fuel,
  },
  {
    campo: 'prioElectric',
    titulo: 'Prio — carregamentos',
    onde: 'myprio.com › Transactions (Electric) › exportar PDF',
    Icone: BatteryCharging,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export function ExpenseImport() {
  const [inicio, setInicio] = useState(segundaPassada);
  const [fim, setFim] = useState(() => maisDias(segundaPassada(), 6));
  const [ficheiros, setFicheiros] = useState<Partial<Record<Campo, File>>>({});
  const [analise, setAnalise] = useState<ResultadoAnalise | null>(null);
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const algumFicheiro = Object.values(ficheiros).some(Boolean);

  async function montarCorpo() {
    const [vv, pf, pe] = await Promise.all([
      ficheiros.viaVerde ? ficheiroParaBase64(ficheiros.viaVerde) : null,
      ficheiros.prioFrota ? ficheiroParaBase64(ficheiros.prioFrota) : null,
      ficheiros.prioElectric ? ficheiroParaBase64(ficheiros.prioElectric) : null,
    ]);
    return {
      semanaInicio: inicio,
      semanaFim: fim,
      viaVerdePdf: vv,
      prioFrotaPdf: pf,
      prioElectricPdf: pe,
    };
  }

  const analisar = useMutation({
    mutationFn: async () => fleetImportService.analisar(await montarCorpo()),
    onMutate: () => { setErro(null); setFeito(null); },
    onSuccess: setAnalise,
    onError: (e) => setErro(e instanceof ApiError || e instanceof Error ? e.message : 'Erro ao analisar.'),
  });

  const importar = useMutation({
    mutationFn: async () => fleetImportService.importar(await montarCorpo()),
    onMutate: () => setErro(null),
    onSuccess: (r) => { setFeito(r); setAnalise(r); },
    onError: (e) => setErro(e instanceof ApiError || e instanceof Error ? e.message : 'Erro ao importar.'),
  });

  const aTrabalhar = analisar.isPending || importar.isPending;
  const porCriar = (analise?.linhas ?? []).filter((l) => !l.bloqueio).length;
  const algumaFonteFalha = (analise?.fontes ?? []).some((f) => f.presente && !f.confere);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Importar despesas"
        subtitle="Os PDFs da Via Verde e da Prio viram rascunhos de fecho"
        icon={<FileUp className="h-5 w-5" />}
      />

      {/* ── A semana ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Semana a fechar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="imp-de" className="text-xs">De</Label>
              <Input
                id="imp-de" type="date" className="h-9 w-[150px]"
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value);
                  // Move o fim com o início: uma semana tem sete dias e ter de
                  // escrever os dois é uma oportunidade a mais de errar.
                  if (e.target.value) setFim(maisDias(e.target.value, 6));
                  setAnalise(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imp-ate" className="text-xs">Até</Label>
              <Input
                id="imp-ate" type="date" className="h-9 w-[150px]"
                value={fim}
                onChange={(e) => { setFim(e.target.value); setAnalise(null); }}
              />
            </div>
          </div>

          {/* O aviso do atraso, com a data já calculada. */}
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              A Via Verde publica os movimentos com 4 a 5 dias de atraso. Para fechar{' '}
              <strong>{curto(inicio)} a {curto(fim)}</strong>, o extrato a exportar de lá é o de{' '}
              <strong>{curto(maisDias(inicio, -7))} a {curto(maisDias(fim, -7))}</strong>.
              {' '}Os da Prio são da própria semana.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Os três ficheiros ────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {FICHEIROS.map(({ campo, titulo, onde, Icone }) => {
          const escolhido = ficheiros[campo];
          return (
            <Card key={campo} className={escolhido ? 'border-emerald-500/40' : undefined}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icone className="h-4 w-4 text-muted-foreground" />
                  {titulo}
                </div>
                <p className="text-xs text-muted-foreground">{onde}</p>
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="h-9 text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setFicheiros((anteriores) => ({ ...anteriores, [campo]: f }));
                    setAnalise(null);
                    setFeito(null);
                  }}
                />
                {escolhido && (
                  <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {escolhido.name}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => analisar.mutate()} disabled={!algumFicheiro || aTrabalhar}>
          {analisar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Analisar
        </Button>
        <Button
          variant="default"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => importar.mutate()}
          disabled={!analise || porCriar === 0 || algumaFonteFalha || aTrabalhar || !!feito}
        >
          {importar.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Upload className="mr-2 h-4 w-4" />}
          Criar {porCriar > 0 ? `${porCriar} ` : ''}rascunho{porCriar === 1 ? '' : 's'}
        </Button>
        {!analise && algumFicheiro && (
          <span className="text-xs text-muted-foreground">Analise primeiro — não grava nada.</span>
        )}
      </div>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="flex gap-2 p-4 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {erro}
          </CardContent>
        </Card>
      )}

      {/* ── O que foi criado ─────────────────────────────────────────────── */}
      {feito && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {feito.criados} rascunho{feito.criados === 1 ? '' : 's'} criado{feito.criados === 1 ? '' : 's'}
              {feito.ignorados > 0 && `, ${feito.ignorados} ignorado${feito.ignorados === 1 ? '' : 's'}`}.
            </p>
            <p className="text-muted-foreground">
              Nada foi creditado. Confirme cada um na faturação e credite à mão.
            </p>
            {feito.falhas.length > 0 && (
              <ul className="space-y-1 text-destructive">
                {feito.falhas.map((f) => (
                  <li key={f.userName}>{f.userName}: {f.motivo}</li>
                ))}
              </ul>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/app/admin/settlements">
                Ir para a faturação <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── O que cada PDF disse ─────────────────────────────────────────── */}
      {analise && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">O que cada ficheiro disse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {analise.fontes.map((f) => (
              <div key={f.nome} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-[190px] shrink-0 text-muted-foreground">{f.nome}</span>
                {!f.presente
                  ? <Badge variant="outline">não enviado</Badge>
                  : (
                    <>
                      <span className="font-medium tabular-nums">{formatCurrency(f.totalLido ?? 0)}</span>
                      {f.totalDeclarado !== null && (
                        <span className="text-xs text-muted-foreground">
                          o documento declara {formatCurrency(f.totalDeclarado)}
                        </span>
                      )}
                      {f.confere
                        ? <Badge className="bg-emerald-600">confere</Badge>
                        : <Badge variant="destructive">não confere</Badge>}
                    </>
                  )}
              </div>
            ))}
            {algumaFonteFalha && (
              <p className="text-xs text-destructive">
                Uma leitura que não confere trava a importação inteira — de propósito: metade das
                despesas num rascunho com ar de completo é pior do que nenhuma.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── A pré-visualização ───────────────────────────────────────────── */}
      {analise && analise.linhas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {feito ? 'Fechos desta importação' : 'O que vai ser criado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Viatura</TableHead>
                    <TableHead className="text-right">Portagens</TableHead>
                    <TableHead className="text-right">Combustível</TableHead>
                    <TableHead className="text-right">Carregamento</TableHead>
                    <TableHead className="text-right">Aluguer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analise.linhas.map((l) => (
                    <TableRow key={l.userId + l.vehicleId} className={l.bloqueio ? 'opacity-60' : undefined}>
                      <TableCell>
                        <div className="font-medium">{l.userName}</div>
                        {l.bloqueio && (
                          <div className="text-xs text-amber-600 dark:text-amber-400">{l.bloqueio}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{l.plate}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(l.tollsAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(l.fuelAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(l.chargeAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(l.vehicleFee)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="border-t p-3 text-xs text-muted-foreground">
              A Uber e a Bolt não vêm destes ficheiros: preencha-as no rascunho, na faturação.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Avisos ───────────────────────────────────────────────────────── */}
      {analise && (analise.avisos.length > 0 || analise.porAtribuir > 0) && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Para rever à mão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            {analise.porAtribuir > 0 && (
              <p>
                <strong className="tabular-nums">{formatCurrency(analise.porAtribuir)}</strong>{' '}
                foram lidos e não entraram em fecho nenhum. Não desapareceram — mas também não
                foram lançados a ninguém.
              </p>
            )}
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {analise.avisos.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
