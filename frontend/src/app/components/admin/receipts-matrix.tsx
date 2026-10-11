// src/app/components/admin/receipts-matrix.tsx
//
// Quanto é que cada motorista passou a cada sociedade, num ano.
//
// ─── A PERGUNTA QUE ESTA TABELA RESPONDE ────────────────────────────────────
//
// "Quanto é que o Diogo passou à Empresa A e quanto passou à Empresa B?" O
// cartão das sociedades, por cima, responde à pergunta de trás para a frente
// — quanto é que cada sociedade recebeu de toda a gente. As duas são precisas
// e não são a mesma.
//
// ─── PORQUE É QUE É UM ANO DE CADA VEZ ──────────────────────────────────────
//
// Porque é assim que a contabilidade pensa. Somar 2025 com 2026 num número só
// dá um valor que não serve para nada: nem para a declaração de um, nem para a
// do outro. O ano abre no actual, que é o que se quer ver em nove de cada dez
// vezes.
//
// ─── PORQUE É QUE UM RECIBO CONTA NA DATA DA APROVAÇÃO ──────────────────────
//
// Porque é quando passou a existir e quando a sociedade lhe foi atribuída. Um
// pedido feito a 30 de dezembro e aprovado a 2 de janeiro conta em janeiro,
// que é quando o dinheiro saiu. Nas retiradas antigas, sem data de aprovação,
// vale a data do pedido — ver a consulta em `companies.service.ts`.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import { Users } from 'lucide-react';
import { formatCurrency } from '@/shared/lib/format';
import { queryKeys } from '@/shared/lib/query-keys';
import { companiesService, type Coluna } from '@/shared/services/companies.service';

/**
 * As colunas que não são vendas levam um tom diferente.
 *
 * "Por classificar" é trabalho por fazer e não dinheiro arrumado: a cinzento,
 * lê-se como o que é — uma coluna que devia estar vazia.
 */
function classeDaColuna(tipo: Coluna['tipo']): string {
  if (tipo === 'porClassificar') return 'text-amber-600 dark:text-amber-400';
  if (tipo === 'nenhum') return 'text-muted-foreground';
  return '';
}

/** Zero mostra-se como traço. Uma coluna de "0,00 €" é ruído a fingir de dado. */
function valor(v: number | undefined, tipo: Coluna['tipo']) {
  if (!v) return <span className="text-muted-foreground/40">—</span>;
  return <span className={classeDaColuna(tipo)}>{formatCurrency(v)}</span>;
}

export function ReceiptsMatrix() {
  const [ano, setAno] = useState(() => new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.companies.porMotorista(ano),
    queryFn: () => companiesService.porMotorista(ano),
  });

  const colunas = data?.colunas ?? [];
  const linhas = data?.linhas ?? [];
  const anos = data?.anos ?? [ano];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Por motorista
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Quanto cada motorista passou a cada sociedade. Conta pela data da
            aprovação.
          </p>
        </div>

        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && colunas.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum recibo em {ano}.
          </p>
        )}

        {!isLoading && colunas.length > 0 && (
          <>
            {/* ── Ecrã largo: a tabela cruzada ──
                Com scroll horizontal e a coluna do nome fixa: com seis
                sociedades a tabela passa a largura, e sem o nome à vista
                deixa de se saber de quem é a linha que se está a ler. */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10">Motorista</TableHead>
                    {colunas.map((c) => (
                      <TableHead key={c.chave} className={`text-right ${classeDaColuna(c.tipo)}`}>
                        {c.nome}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.userId} className={l.total === 0 ? 'opacity-50' : ''}>
                      <TableCell className="sticky left-0 bg-card z-10 font-medium whitespace-nowrap">
                        {l.nome}
                      </TableCell>
                      {colunas.map((c) => (
                        <TableCell key={c.chave} className="text-right whitespace-nowrap">
                          {valor(l.valores[c.chave], c.tipo)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {l.total === 0
                          ? <span className="text-muted-foreground/40">—</span>
                          : formatCurrency(l.total)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* A linha dos totais. É o que fecha a leitura por coluna:
                      quanto é que cada sociedade recebeu de toda a gente. */}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell className="sticky left-0 bg-card z-10">Total</TableCell>
                    {colunas.map((c) => (
                      <TableCell key={c.chave} className="text-right whitespace-nowrap">
                        {valor(data?.totaisPorColuna[c.chave], c.tipo)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right whitespace-nowrap">
                      {formatCurrency(data?.total ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* ── Telemóvel: um bloco por motorista ──
                Uma tabela de oito colunas num ecrã de telemóvel não se lê, por
                mais scroll que tenha. Os que não passaram nada ficam de fora
                aqui: ocupariam metade do ecrã a dizer zero. */}
            <div className="md:hidden space-y-3">
              {linhas.filter((l) => l.total > 0).map((l) => (
                <div key={l.userId} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{l.nome}</span>
                    <span className="font-semibold">{formatCurrency(l.total)}</span>
                  </div>
                  <div className="space-y-1">
                    {colunas.filter((c) => l.valores[c.chave]).map((c) => (
                      <div key={c.chave} className="flex justify-between text-sm">
                        <span className={`text-muted-foreground ${classeDaColuna(c.tipo)}`}>
                          {c.nome}
                        </span>
                        <span className={classeDaColuna(c.tipo)}>
                          {formatCurrency(l.valores[c.chave])}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-between border-t pt-3 font-semibold">
                <span>Total em {ano}</span>
                <span>{formatCurrency(data?.total ?? 0)}</span>
              </div>

              {linhas.some((l) => l.total === 0) && (
                <p className="text-xs text-muted-foreground">
                  {linhas.filter((l) => l.total === 0).length} motorista(s) sem
                  recibos em {ano}.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
