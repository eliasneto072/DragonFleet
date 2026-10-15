// src/app/components/shared/importar-extratos.tsx
//
// Carregar um extrato do banco, rever linha a linha, e só então gravar.
//
// ─── UM COMPONENTE PARA OS DOIS LADOS ───────────────────────────────────────
//
// O mesmo ecrã serve o dinheiro pessoal e o da empresa; muda o `ambito`. Dois
// ecrãs iguais acabavam por divergir no primeiro ajuste, e a revisão é
// precisamente a parte que não pode ter duas versões.
//
// ─── O QUE MUDA ENTRE OS DOIS ───────────────────────────────────────────────
//
// EMPRESA — as saídas vêm já marcadas para contar como despesa. As entradas
// NUNCA contam: a receita da empresa vem dos fechos semanais, e importá-la
// outra vez do banco contava o mesmo dinheiro duas vezes.
//
// PESSOAL — nada vem marcado. O saldo de motorista é o que a empresa lhe deve,
// não a conta bancária dele; ele marca à mão as que quer descontar de facto.
//
// ─── PORQUE É QUE NADA SE GRAVA NO PRIMEIRO PASSO ───────────────────────────
//
// Porque isto lê PDFs, e um leitor de PDFs engana-se. Com dois passos, o pior
// que uma leitura errada consegue fazer é aparecer no ecrã.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { FilePicker } from '@/app/components/ui/file-picker';
import {
  AlertTriangle, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  extratosService, NOME_DO_BANCO,
  type Ambito, type Classe, type MovimentoPrevisto, type Previsao,
} from '@/shared/services/extratos.service';
import { formatCurrency } from '@/shared/lib/format';

const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-PT') : '—');

const ICONE: Record<Classe, typeof ArrowUpRight> = {
  DESPESA: ArrowDownLeft,
  RECEITA: ArrowUpRight,
  TRANSFERENCIA: ArrowRightLeft,
};

const ROTULO: Record<Classe, string> = {
  DESPESA: 'Despesa',
  RECEITA: 'Entrada',
  TRANSFERENCIA: 'Transferência',
};

export function ImportarExtratos({ ambito }: { ambito: Ambito }) {
  const qc = useQueryClient();
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [erroDoFicheiro, setErroDoFicheiro] = useState('');
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [linhas, setLinhas] = useState<MovimentoPrevisto[]>([]);
  const [contaId, setContaId] = useState<string>('');
  const [nomeDaConta, setNomeDaConta] = useState('');

  const chave = ['extratos', ambito];

  const contas = useQuery({
    queryKey: [...chave, 'contas'],
    queryFn: () => extratosService.contas(ambito),
  });

  const importados = useQuery({
    queryKey: [...chave, 'lista'],
    queryFn: () => extratosService.listar(ambito),
  });

  const prever = useMutation({
    mutationFn: () => extratosService.prever(ambito, ficheiro as File),
    onSuccess: (p) => {
      setPrevisao(p);
      setLinhas(p.movimentos);
      setContaId(p.conta.id ?? '');
      setNomeDaConta(p.conta.label ?? `${NOME_DO_BANCO[p.banco]} ···${p.conta.tail ?? ''}`);
    },
    // A mensagem vem do servidor já escrita para se ler: diz se o PDF é uma
    // imagem, se o banco não é reconhecido, ou em que linha os valores não
    // fecham com o saldo.
    onError: (e: Error) => toast.error(e.message || 'Não foi possível ler este extrato.'),
  });

  const importar = useMutation({
    mutationFn: () => extratosService.importar({
      ambito,
      contaId: contaId || null,
      novaConta: contaId ? null : {
        banco: previsao!.banco,
        tail: previsao!.conta.tail ?? '0000',
        label: nomeDaConta.trim() || 'Conta',
      },
      ficheiro: previsao!.ficheiro,
      periodo: previsao!.periodo,
      saldoInicial: previsao!.saldoInicial,
      saldoFinal: previsao!.saldoFinal,
      movimentos: linhas,
    }),
    onSuccess: (r) => {
      toast.success(
        `${r.movimentos} movimentos guardados`
        + (r.despesasCriadas > 0 ? `, ${r.despesasCriadas} como despesa.` : '.'),
      );
      limpar();
      void qc.invalidateQueries({ queryKey: chave });
      // O lucro e o saldo mudaram: as telas que os mostram têm de recarregar.
      void qc.invalidateQueries({ queryKey: ['empresa'] });
      void qc.invalidateQueries({ queryKey: ['pessoal'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível gravar.'),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => extratosService.apagar(ambito, id),
    onSuccess: () => {
      toast.success('Importação removida, e as despesas que ela criou também.');
      void qc.invalidateQueries({ queryKey: chave });
      void qc.invalidateQueries({ queryKey: ['empresa'] });
      void qc.invalidateQueries({ queryKey: ['pessoal'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível remover.'),
  });

  function limpar() {
    setPrevisao(null);
    setLinhas([]);
    setFicheiro(null);
    setErroDoFicheiro('');
    setContaId('');
    setNomeDaConta('');
  }

  function mudarClasse(pos: number, classe: Classe) {
    setLinhas((ls) => ls.map((l) => (l.pos === pos
      // Uma transferência nunca conta, e uma entrada também não: mudar a
      // classe tem de desligar a marca, senão ficava marcada uma linha que o
      // servidor ia recusar contar e ele via uma contagem que não acontece.
      ? { ...l, classe, conta: classe === 'DESPESA' ? l.conta : false }
      : l)));
  }

  function mudarConta(pos: number, conta: boolean) {
    setLinhas((ls) => ls.map((l) => (l.pos === pos ? { ...l, conta } : l)));
  }

  const marcadas = linhas.filter((l) => l.conta).length;
  const totalMarcado = linhas.filter((l) => l.conta)
    .reduce((s, l) => s + Math.abs(l.valor), 0);

  return (
    <div className="space-y-6">
      {/* ── Carregar ─────────────────────────────────────────────────────── */}
      {!previsao && (
        <Card>
          <CardHeader>
            <CardTitle>Importar extrato do banco</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Carregue o PDF do extrato. Leio o ABANCA, o Novo Banco, o Millennium BCP,
              a Revolut e a Revolut Business. Nada é gravado antes de o ver.
            </p>

            <FilePicker
              id="ficheiro-do-extrato"
              label="Extrato em PDF"
              hint="O ficheiro que o banco dá, sem o alterar."
              file={ficheiro}
              onChange={setFicheiro}
              error={erroDoFicheiro}
              onError={setErroDoFicheiro}
              disabled={prever.isPending}
            />

            <Button onClick={() => prever.mutate()} disabled={!ficheiro || prever.isPending}>
              <Upload className="mr-1.5 h-4 w-4" aria-hidden />
              {prever.isPending ? 'A ler…' : 'Ler o extrato'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Rever ────────────────────────────────────────────────────────── */}
      {previsao && (
        <Card>
          <CardHeader>
            <CardTitle>
              {NOME_DO_BANCO[previsao.banco]}
              {previsao.conta.tail && <> ···{previsao.conta.tail}</>}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>{dia(previsao.periodo.de)} a {dia(previsao.periodo.ate)}</span>
              <span>{previsao.movimentos.length} movimentos</span>
              {previsao.saldoInicial !== null && (
                <span>Saldo inicial {formatCurrency(previsao.saldoInicial)}</span>
              )}
              {previsao.saldoFinal !== null && (
                <span>Saldo final {formatCurrency(previsao.saldoFinal)}</span>
              )}
            </div>

            {previsao.avisos.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary p-3">
                {previsao.avisos.map((a) => (
                  <p key={a} className="flex gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {a}
                  </p>
                ))}
              </div>
            )}

            {/* A conta a que o extrato pertence. Reconhecida pelos quatro
                últimos dígitos do IBAN; se for nova, ele dá-lhe um nome. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="conta-do-extrato">Conta</Label>
                <Select value={contaId || 'nova'} onValueChange={(v) => setContaId(v === 'nova' ? '' : v)}>
                  <SelectTrigger id="conta-do-extrato">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(contas.data?.contas ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label} ···{c.tail}
                      </SelectItem>
                    ))}
                    <SelectItem value="nova">Conta nova</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!contaId && (
                <div className="space-y-1.5">
                  <Label htmlFor="nome-da-conta">Nome desta conta</Label>
                  <Input
                    id="nome-da-conta"
                    value={nomeDaConta}
                    onChange={(e) => setNomeDaConta(e.target.value)}
                    maxLength={60}
                    placeholder="Abanca empresa"
                  />
                </div>
              )}
            </div>

            {/* ── As linhas ─────────────────────────────────────────────── */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Descrição</th>
                    <th className="py-2 pr-3 text-right font-medium">Valor</th>
                    <th className="py-2 pr-3 font-medium">Tipo</th>
                    <th className="py-2 font-medium">
                      {ambito === 'EMPRESA' ? 'Conta no lucro' : 'Sai do saldo'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const Icone = ICONE[l.classe];
                    return (
                      <tr key={l.pos} className="border-b border-border/50 align-top">
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                          {dia(l.data)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="block max-w-[26rem]">{l.descricao}</span>
                          {/* O motivo só aparece quando houve mesmo um
                              reconhecimento. Mostrá-lo em todas as linhas
                              («saiu dinheiro da conta») era ruído que fazia
                              ignorar os que interessam. */}
                          {l.confianca !== 'pelo-sinal' && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {l.motivo}
                            </span>
                          )}
                        </td>
                        <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${
                          l.valor < 0 ? 'text-destructive' : ''
                        }`}>
                          {formatCurrency(l.valor)}
                        </td>
                        <td className="py-2 pr-3">
                          <Select
                            value={l.classe}
                            onValueChange={(v) => mudarClasse(l.pos, v as Classe)}
                          >
                            <SelectTrigger className="h-8 w-[9.5rem]">
                              <span className="flex items-center gap-1.5">
                                <Icone className="h-3.5 w-3.5" aria-hidden />
                                {ROTULO[l.classe]}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DESPESA">Despesa</SelectItem>
                              <SelectItem value="RECEITA">Entrada</SelectItem>
                              <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2">
                          {/* Só uma SAÍDA pode virar despesa. Uma entrada ou
                              uma transferência não têm aqui nada para marcar. */}
                          {l.classe === 'DESPESA' && l.valor < 0 ? (
                            <Checkbox
                              checked={l.conta}
                              onCheckedChange={(v) => mudarConta(l.pos, v === true)}
                              aria-label="Contar esta linha"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                {marcadas === 0
                  ? (ambito === 'EMPRESA'
                    ? 'Nenhuma linha vai contar no lucro.'
                    : 'Nenhuma linha vai sair do seu saldo. Fica tudo como registo.')
                  : `${marcadas} linha(s), ${formatCurrency(totalMarcado)} `
                    + (ambito === 'EMPRESA' ? 'a contar no lucro.' : 'a sair do seu saldo.')}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={limpar}>Cancelar</Button>
                <Button onClick={() => importar.mutate()} disabled={importar.isPending}>
                  {importar.isPending ? 'A gravar…' : 'Guardar'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Já importados ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Extratos já importados</CardTitle>
        </CardHeader>
        <CardContent>
          {importados.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (importados.data?.extratos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não importou nenhum.</p>
          ) : (
            <ul className="space-y-2">
              {(importados.data?.extratos ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-sm"
                >
                  <Badge variant="secondary">{NOME_DO_BANCO[e.conta.bank]}</Badge>
                  <span className="font-medium">{e.conta.label}</span>
                  <span className="text-muted-foreground">
                    {dia(e.de)} a {dia(e.ate)} · {e.movimentos} movimentos
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-8 px-2 text-muted-foreground"
                    onClick={() => apagar.mutate(e.id)}
                    disabled={apagar.isPending}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
