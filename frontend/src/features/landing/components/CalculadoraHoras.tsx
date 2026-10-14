// src/features/landing/components/CalculadoraHoras.tsx
//
// A calculadora do gestor: quantas horas lhe custa a papelada por ano.
//
// ─── PORQUE É QUE ESTA CALCULADORA É DIFERENTE DA DO MOTORISTA ──────────────
//
// A do motorista mostra o que NÓS cobramos: é uma conta nossa, e tem de ser
// exacta. Esta mostra o que o problema DELE custa — e por isso todos os
// números que entram são escritos por ele.
//
// A versão mais vendedora desta secção seria outra: "um carro parado três
// dias por um seguro expirado custa-te X". Mas essa obrigava-nos a afirmar
// quanto rende um carro, quantas vezes isso acontece por ano e durante
// quantos dias — três números que variam de frota para frota e que, errados
// numa página pública, destroem a credibilidade de tudo o que está à volta.
//
// Horas de fecho, ele sabe quantas são: passa-as. Nós só multiplicamos por 52
// e convertemos em dias de trabalho, que é a mesma verdade dita de uma
// maneira que se sente. Um comprador que faz a conta sozinho convence-se
// melhor do que um comprador a quem se diz o resultado.
//
// ─── O CAMPO DOS EUROS ESTÁ VAZIO E FICA VAZIO ──────────────────────────────
//
// Se ele não escrever quanto vale a hora dele, a tela não mostra euros
// nenhuns. Um valor por hora assumido por nós era um número nosso disfarçado
// de número dele — e é precisamente assim que estas calculadoras perdem a
// confiança de quem as lê.

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { contaDeHoras } from '../horas';
import { VERDE } from './Chrome';

const eur = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

const num = (v: number) =>
  v.toLocaleString('pt-PT', { maximumFractionDigits: 1 });

export function CalculadoraHoras() {
  // Começa com um valor para a tela já dizer algo a quem só passa os olhos.
  // Quatro horas é modesto de propósito: se exagerássemos aqui, o primeiro
  // pensamento de quem lê era "a mim não me leva tanto tempo" — e perdíamos
  // a pessoa na própria secção que a devia convencer.
  const [horas, setHoras] = useState('4');
  const [valorHora, setValorHora] = useState('');

  const c = contaDeHoras(
    Number(String(horas).replace(',', '.')),
    Number(String(valorHora).replace(',', '.')),
  );

  const campo = 'w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 '
    + 'text-lg text-white placeholder:text-white/30 outline-none transition '
    + 'focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/30';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5" style={{ color: VERDE }} />
        <h3 className="text-xl font-semibold text-white">
          Quanto te custa a papelada
        </h3>
      </div>

      <p className="mt-2 text-sm text-white/60">
        Fechos, recibos, documentos, mensagens a responder. Mete as tuas horas
        — os números são todos teus, nós não assumimos nenhum.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="horas" className="text-sm font-medium text-white/80">
            Horas por semana nisto
          </label>
          <div className="relative mt-2">
            <input
              id="horas"
              type="number" min={0} max={80} step={0.5} inputMode="decimal"
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              className={`${campo} pr-12`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/40">
              h
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="valorHora" className="text-sm font-medium text-white/80">
            O que vale a tua hora
            <span className="ml-1.5 font-normal text-white/35">(opcional)</span>
          </label>
          <div className="relative mt-2">
            <input
              id="valorHora"
              type="number" min={0} step={1} inputMode="decimal"
              value={valorHora}
              onChange={(e) => setValorHora(e.target.value)}
              placeholder="deixa vazio se preferires"
              className={`${campo} pr-10`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">€</span>
          </div>
        </div>
      </div>

      {/* ── O resultado ──
          Dois blocos quando não há euros, três quando há. As horas por ano
          são o número honesto; os dias de trabalho são o mesmo número dito de
          forma a doer. */}
      <div className={`mt-7 grid gap-3 ${c.temCusto ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className="rounded-xl bg-black/25 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Horas por ano
          </p>
          <p className="mt-1 text-3xl font-bold text-white">{num(c.horasPorAno)}</p>
        </div>

        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'rgba(16,136,101,0.4)', background: 'rgba(16,136,101,0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Dias de trabalho
          </p>
          <p className="mt-1 text-3xl font-bold" style={{ color: VERDE }}>
            {num(c.diasPorAno)}
          </p>
          <p className="mt-1 text-xs text-white/35">Dias de 8 horas, por ano</p>
        </div>

        {c.temCusto && (
          <div className="rounded-xl bg-black/25 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Ao teu valor/hora
            </p>
            <p className="mt-1 text-3xl font-bold text-white">{eur(c.custoPorAno)}</p>
            <p className="mt-1 text-xs text-white/35">Por ano</p>
          </div>
        )}
      </div>

      {/* A frase que fecha o argumento. Não diz "poupas tudo isto", porque
          não é verdade: lançar os valores também leva tempo. Diz o que é
          verdade — que a maior parte disto deixa de existir. */}
      <p className="mt-5 text-sm leading-relaxed text-white/50">
        A maior parte deste tempo deixa de existir: os valores lançam-se uma vez
        e as contas, os saldos e os avisos fazem-se sozinhos. O fecho continua a
        dar trabalho — mas minutos, e não um sábado.
      </p>
    </div>
  );
}
