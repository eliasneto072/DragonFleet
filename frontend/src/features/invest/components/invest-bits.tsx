// src/features/invest/components/invest-bits.tsx
//
// As peças pequenas que aparecem em mais do que uma página do portal: datas,
// a linha de um movimento, o estado de um pedido.
//
// Estão juntas num ficheiro porque são pequenas e mudam ao mesmo tempo — a
// forma de escrever uma data e a forma de escrever um movimento são a mesma
// decisão de estilo.

import { formatCurrency } from '@/shared/lib/format';
import type {
  InvestorMovement, MovementKind, WithdrawalStatus,
} from '@/shared/services/investors.service';

/** 2026-03-14 → 14/03/2026 */
export const dia = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** 2026-03 → Março */
export function mesLegivel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MESES[m - 1] ?? ym;
}

const NOME_DO_TIPO: Record<MovementKind, string> = {
  DEPOSIT: 'Depósito',
  ACCRUAL: 'Rendimento',
  WITHDRAWAL: 'Resgate',
  ADJUSTMENT: 'Acerto',
};

export function nomeDoTipo(k: MovementKind): string {
  return NOME_DO_TIPO[k] ?? k;
}

export const ESTADO_DO_PEDIDO: Record<WithdrawalStatus, string> = {
  PENDING: 'A aguardar',
  PAID: 'Pago',
  REJECTED: 'Recusado',
};

/**
 * Uma linha do extrato.
 *
 * O sinal é dado pelo próprio número (+ ou −) e não por uma cor: um extrato
 * com metade das linhas a verde e metade a vermelho lê-se como um alerta
 * permanente. Só o valor positivo leva um toque de ouro, e os negativos ficam
 * no cinzento normal do texto.
 */
export function MovementRow({ m }: { m: InvestorMovement }) {
  const positivo = m.amount >= 0;

  return (
    <div className="inv-row flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {nomeDoTipo(m.kind)}
          <span className="ml-2 text-xs text-[var(--muted-foreground)]">
            {m.bucket === 'CAPITAL' ? 'capital' : 'rendimento'}
          </span>
        </p>
        {m.description && (
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            {m.description}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p
          className="inv-display text-base"
          style={positivo ? { color: 'var(--gold-200)' } : undefined}
        >
          {positivo ? '+' : '−'} {formatCurrency(Math.abs(m.amount))}
        </p>
        <p className="text-[11px] text-[var(--muted-foreground)]">{dia(m.day)}</p>
      </div>
    </div>
  );
}

export function Chip({ estado }: { estado: WithdrawalStatus }) {
  return (
    <span className={`inv-chip ${estado === 'PENDING' ? 'inv-chip-gold' : ''}`}>
      {ESTADO_DO_PEDIDO[estado]}
    </span>
  );
}
