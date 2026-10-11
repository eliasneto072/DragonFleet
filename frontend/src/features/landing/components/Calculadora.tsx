// src/features/landing/components/Calculadora.tsx
//
// A calculadora de ganhos.
//
// ─── PORQUE É QUE NÃO HÁ UM VALOR "TÍPICO" ──────────────────────────────────
//
// Porque não existe ordenado fixo: cada um ganha o que trabalha. Qualquer
// número que puséssemos como exemplo — "um motorista médio faz X" — passava a
// ser a expectativa de quem o lesse, e a primeira semana abaixo disso é uma
// conversa difícil que a página criou sozinha.
//
// Então o bruto é ESCRITO pela pessoa, e a tela diz-lhe isso por palavras. O
// que a calculadora mostra não é o que ela vai ganhar: é o que a DragonFleet
// cobra sobre o que ela faturar. Essa parte é exacta, e é a única que
// controlamos.
//
// ─── E PORQUE É QUE MOSTRA O QUE FICA DO NOSSO LADO ─────────────────────────
//
// Porque esconder uma comissão não a torna menor — torna-a suspeita. Linha a
// linha: a percentagem, o slot, o que fica para a frota, e o que fica para
// ele. Quem vê as contas abertas confia nas contas; quem só vê o resultado
// vai desconfiar na primeira semana em que lhe parecer pouco.

import { useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import {
  contaCarroProprio, contaCarroDaFrota, porMes, CARRO_PROPRIO,
} from '../calculadora';
import { VERDE } from './Chrome';

type Modo = 'proprio' | 'frota';

const eur = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

function Linha({
  rotulo, valor, destaque, nota,
}: { rotulo: string; valor: string; destaque?: 'ele' | 'nos'; nota?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-3 ${
      destaque ? '' : 'border-b border-white/10'
    }`}
    >
      <div>
        <span className={destaque === 'ele' ? 'font-semibold text-white' : 'text-white/60'}>
          {rotulo}
        </span>
        {nota && <p className="text-xs text-white/35">{nota}</p>}
      </div>
      <span
        className={
          destaque === 'ele'
            ? 'text-2xl font-bold'
            : destaque === 'nos'
              ? 'font-semibold text-white/80'
              : 'text-white/70'
        }
        style={destaque === 'ele' ? { color: VERDE } : undefined}
      >
        {valor}
      </span>
    </div>
  );
}

export function Calculadora() {
  const [modo, setModo] = useState<Modo>('proprio');
  const [bruto, setBruto] = useState('1000');
  const [aluguer, setAluguer] = useState('');

  const b = Number(String(bruto).replace(',', '.'));
  const a = Number(String(aluguer).replace(',', '.'));

  const c = modo === 'proprio' ? contaCarroProprio(b) : contaCarroDaFrota(b, a);

  const aba = (activa: boolean) =>
    `flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
      activa ? 'text-white' : 'text-white/50 hover:text-white/80'
    }`;

  const campo = 'w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 '
    + 'text-lg text-white placeholder:text-white/30 outline-none transition '
    + 'focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/30';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5" style={{ color: VERDE }} />
        <h3 className="text-xl font-semibold text-white">Faz as contas</h3>
      </div>

      <p className="mt-2 text-sm text-white/60">
        Não há ordenado fixo — ganhas o que trabalhares. Mete aqui o que achas
        que faturas por semana e vê o que te fica.
      </p>

      {/* ── Os dois casos ── */}
      <div className="mt-6 flex gap-1 rounded-xl bg-black/30 p-1">
        <button
          type="button"
          onClick={() => setModo('proprio')}
          className={aba(modo === 'proprio')}
          style={modo === 'proprio' ? { background: VERDE } : undefined}
        >
          Carro próprio
        </button>
        <button
          type="button"
          onClick={() => setModo('frota')}
          className={aba(modo === 'frota')}
          style={modo === 'frota' ? { background: VERDE } : undefined}
        >
          Carro da frota
        </button>
      </div>

      {/* ── O que ele escreve ── */}
      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="bruto" className="text-sm font-medium text-white/80">
            O que faturas por semana, em bruto
          </label>
          <div className="relative mt-2">
            <input
              id="bruto"
              type="number" min={0} step={10} inputMode="decimal"
              value={bruto}
              onChange={(e) => setBruto(e.target.value)}
              className={`${campo} pr-10`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">€</span>
          </div>
          <p className="mt-1.5 text-xs text-white/35">
            Uber, Bolt e o resto somados, antes de descontos.
          </p>
        </div>

        {modo === 'frota' && (
          <div>
            <label htmlFor="aluguer" className="text-sm font-medium text-white/80">
              Aluguer semanal do carro
            </label>
            <div className="relative mt-2">
              <input
                id="aluguer"
                type="number" min={0} step={10} inputMode="decimal"
                value={aluguer}
                onChange={(e) => setAluguer(e.target.value)}
                placeholder="depende do carro"
                className={`${campo} pr-10`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">€</span>
            </div>
            {/* Dito aqui e não só no fim: é o único número desta tela que não
                podemos dar, e deixar a pessoa a adivinhar sem o dizer era
                pior do que não ter este modo. */}
            <p className="mt-1.5 text-xs text-white/35">
              Varia com o carro. Dizemos-te o valor exacto ao telefone — mete
              um valor para experimentares.
            </p>
          </div>
        )}
      </div>

      {/* ── As contas, linha a linha ── */}
      <div className="mt-7 rounded-xl bg-black/25 px-5 py-2">
        <Linha rotulo="Faturação bruta" valor={eur(c.bruto)} />

        {modo === 'proprio' ? (
          <>
            <Linha
              rotulo={`Comissão DragonFleet (${CARRO_PROPRIO.comissao}%)`}
              valor={`− ${eur(c.comissao)}`}
            />
            <Linha
              rotulo="Slot semanal"
              valor={`− ${eur(c.slot)}`}
              nota="Fixo, independente do que faturares."
            />
          </>
        ) : (
          <Linha rotulo="Aluguer do carro" valor={`− ${eur(c.slot)}`} />
        )}

        <Linha rotulo="Fica para a frota" valor={eur(c.totalCobrado)} destaque="nos" />
      </div>

      {/* ── O resultado, por semana e por mês ──
          Dois blocos e não uma linha pequena: é isto que a pessoa veio ver, e
          o mês é o número que ela compara com o que ganha hoje. A semana fica
          ao lado porque é a unidade em que o trabalho acontece — e porque um
          valor mensal sozinho esconde que depende de trabalhar todas as
          semanas do mês. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'rgba(16,136,101,0.4)', background: 'rgba(16,136,101,0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Fica para ti · por semana
          </p>
          <p className="mt-1 text-3xl font-bold" style={{ color: VERDE }}>
            {eur(c.liquido)}
          </p>
        </div>

        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'rgba(16,136,101,0.4)', background: 'rgba(16,136,101,0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Fica para ti · por mês
          </p>
          <p className="mt-1 text-3xl font-bold" style={{ color: VERDE }}>
            {eur(porMes(c.liquido))}
          </p>
          {/* O mês é 52 semanas a dividir por 12, e não quatro. Dito, porque
              quem faz a conta de cabeça com 4 chega a outro número e fica a
              pensar que a nossa está errada. */}
          <p className="mt-1 text-xs text-white/35">
            Se mantiveres essa faturação todas as semanas
          </p>
        </div>
      </div>

      {/* O aviso de quando o bruto não chega. Dito, e não escondido atrás de
          um zero que parece um erro de cálculo. */}
      {c.abaixoDoMinimo && (
        <p className="mt-4 rounded-lg bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
          Com essa faturação não chegas para cobrir
          {modo === 'proprio' ? ' o slot e a comissão' : ' o aluguer'}.
          Numa semana assim a diferença fica em dívida e sai da seguinte —
          explicamos isso com calma antes de começares.
        </p>
      )}

      {/* ── O que esta conta NÃO inclui ──
          No fim e por escrito. Uma calculadora que mostra um líquido limpo e
          cala os custos dele é a razão por que ninguém acredita em
          calculadoras destas. */}
      <div className="mt-5 flex items-start gap-2.5 text-xs text-white/40">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Esta conta mostra só o que a DragonFleet cobra. O combustível ou a
          carga, as portagens, as refeições e os teus impostos saem do que fica
          para ti — e dependem de como trabalhas. Não estimamos quanto vais
          faturar: esse número é o que tu escreveres aqui.
        </p>
      </div>
    </div>
  );
}
