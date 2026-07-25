// src/app/components/driver/earnings-history-modal.tsx
//
// Histórico completo de ganhos, aberto pelo botão "Histórico" do hero do
// dashboard. Substitui o card "Ganhos recentes", que mostrava apenas cinco
// linhas e ocupava uma secção inteira da tela.
//
// Inclui os ajustes de saldo lançados pela administração, porque para o
// motorista um crédito é uma corrida que entrou por fora — a mesma regra
// aplicada aos cartões de KPI do dashboard. O rótulo mostrado é "Adicionado
// pela gestão" / "Desconto", não "crédito" e "débito".
//
// Nota sobre datas: Earning tem `date` (o dia da corrida), enquanto
// BalanceAdjustment só tem `createdAt` (quando a administração lançou). Os
// ajustes são datados pela criação — é a única data disponível hoje, e o
// backend aplica exatamente o mesmo critério ao montar o PDF, para que o
// documento não divirja desta lista.
//
// Responsividade: o DialogContent tem max-w-[calc(100%-2rem)] e p-6, logo num
// ecrã de 360px sobram ~280px de conteúdo. Por isso a data vive na linha
// secundária junto ao detalhe, em vez de ocupar uma coluna própria.

import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { FileDown, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/shared/lib/format';
import { platformColor, platformLabel, ADJUSTMENT_COLOR } from '@/shared/lib/platform-labels';
import { driverReportsService } from '@/features/driver/services/reports.service';
import type { Adjustment } from '@/features/admin/services/balance.service';
import type { ApiEarning } from '@/shared/types/api';

type Preset = '30d' | '90d' | 'year' | 'all' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  year: 'Este ano',
  all: 'Tudo',
  custom: 'Personalizado',
};

/** Linha unificada: um ganho registado ou um ajuste de saldo. */
interface HistoryRow {
  id: string;
  date: Date;
  label: string;
  sublabel: string;
  amount: number; // negativo para descontos
  color: string;
}

function toLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const datePart = String(value).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date(value);
}

function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function presetRange(preset: Preset): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  if (preset === '30d') from.setDate(from.getDate() - 29);
  else if (preset === '90d') from.setDate(from.getDate() - 89);
  else if (preset === 'year') from.setMonth(0, 1);
  else from.setFullYear(2000, 0, 1); // 'all'

  return { from, to };
}

interface Props {
  open: boolean;
  onClose: () => void;
  earnings: ApiEarning[];
  adjustments: Adjustment[];
}

export function EarningsHistoryModal({ open, onClose, earnings, adjustments }: Props) {
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState(() => toInputValue(presetRange('30d').from));
  const [customTo, setCustomTo] = useState(() => toInputValue(new Date()));
  const [isDownloading, setIsDownloading] = useState(false);

  const range = useMemo(() => {
    if (preset !== 'custom') return presetRange(preset);
    const from = toLocalDate(customFrom);
    const to = toLocalDate(customTo);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [preset, customFrom, customTo]);

  const rows = useMemo<HistoryRow[]>(() => {
    const earningRows: HistoryRow[] = earnings.map((e) => ({
      id: `e-${e.id}`,
      date: toLocalDate(e.date),
      label: platformLabel(e.platform),
      sublabel: 'Corrida registada',
      amount: Number(e.amount),
      color: platformColor(e.platform),
    }));

    const adjustmentRows: HistoryRow[] = adjustments.map((a) => ({
      id: `a-${a.id}`,
      date: new Date(a.createdAt),
      label: a.type === 'CREDIT' ? 'Adicionado pela gestão' : 'Desconto',
      sublabel: a.reason?.trim() || 'Lançado pela administração',
      amount: a.type === 'CREDIT' ? Number(a.amount) : -Number(a.amount),
      color: ADJUSTMENT_COLOR,
    }));

    return [...earningRows, ...adjustmentRows]
      .filter((r) => r.date >= range.from && r.date <= range.to)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [earnings, adjustments, range]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  async function handleDownloadPdf() {
    setIsDownloading(true);
    try {
      await driverReportsService.downloadEarningsPdf({
        from: toInputValue(range.from),
        to: toInputValue(range.to),
      });
    } catch (err: any) {
      toast.error(err?.message ?? 'Não foi possível gerar o PDF.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de ganhos</DialogTitle>
          <DialogDescription>
            Tudo o que entrou e saiu da sua conta, por período.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <Label htmlFor="preset">Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger id="preset"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === 'custom' && (
            <>
              <div className="min-w-[130px] flex-1 space-y-1.5">
                <Label htmlFor="from">De</Label>
                <Input
                  id="from" type="date" value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="min-w-[130px] flex-1 space-y-1.5">
                <Label htmlFor="to">Até</Label>
                <Input
                  id="to" type="date" value={customTo}
                  min={customFrom} max={toInputValue(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Resumo do período */}
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-secondary px-3 py-2.5">
          <span className="text-sm text-muted-foreground">
            {rows.length} lançamento{rows.length !== 1 ? 's' : ''}
          </span>
          <span className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>

        {/* Lista */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nenhum lançamento neste período.
            </p>
          </div>
        ) : (
          <ul className="max-h-[38vh] overflow-y-auto pr-1 sm:max-h-[46vh]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: r.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.date.toLocaleDateString('pt-PT')} · {r.sublabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    r.amount < 0 ? 'text-destructive' : 'text-success'
                  }`}
                >
                  {r.amount < 0 ? '−' : '+'} {formatCurrency(Math.abs(r.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Fechar
          </Button>
          <Button
            onClick={handleDownloadPdf}
            disabled={rows.length === 0 || isDownloading}
            className="w-full sm:w-auto"
          >
            {isDownloading
              ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A gerar…</>)
              : (<><FileDown className="mr-2 h-4 w-4" />Baixar PDF</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
