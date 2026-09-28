// src/app/components/ranks/rank-card.tsx
//
// O cartão do nível, no painel do motorista.
//
// Responde a três perguntas, por esta ordem: em que nível estou, o que ganho
// com isso, e o que me falta para o próximo. Um nível que não diz o que falta
// é uma medalha; com a barra e os números em falta passa a ser um objetivo.
//
// O fundo muda com a cor do nível (definida no painel), e é isso que faz a
// subida sentir-se: o painel do motorista muda de cara quando ele sobe.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { ranksService, tierIndex, type RankConfig } from '@/shared/services/ranks.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import {
  RankBadge, TierIcon, rankGoals, rankGradient, rankPerks, readableOn,
} from '@/app/components/ranks/rank-visuals';

const dia = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

function porConfig(configs: RankConfig[] | undefined) {
  return new Map((configs ?? []).map((c) => [c.tier, c]));
}

export function useRankStatus() {
  return useQuery({
    queryKey: queryKeys.ranks.me,
    queryFn: () => ranksService.me(),
  });
}

export function useRankConfigs() {
  return useQuery({
    queryKey: queryKeys.ranks.configs,
    queryFn: () => ranksService.configs(),
    // A escada muda muito raramente; não vale a pena voltar a pedi-la a cada
    // navegação.
    staleTime: 5 * 60 * 1000,
  });
}

export function RankCard() {
  const statusQ = useRankStatus();
  const configsQ = useRankConfigs();
  const [aberto, setAberto] = useState(false);

  const status = statusQ.data?.status;
  const configs = configsQ.data?.configs;
  const mapa = porConfig(configs);

  if (statusQ.isLoading || configsQ.isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  // Sem níveis configurados não há nada para mostrar — e mostrar um cartão
  // vazio a toda a frota seria pior do que não o mostrar.
  if (!status || !configs?.length) return null;

  const atual = mapa.get(status.tier);
  if (!atual) return null;

  const cor = atual.color;
  const texto = readableOn(cor);
  const proximo = status.next ? mapa.get(status.next.tier) : undefined;
  const vantagens = rankPerks(atual);
  const protegido = !!status.floorTier && status.floorDaysLeft > 0
    && tierIndex(status.floorTier) > tierIndex(status.earnedTier);

  return (
    <div className="overflow-hidden rounded-xl shadow-card" style={{ background: rankGradient(cor), color: texto }}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide" style={{ color: texto, opacity: 0.75 }}>
              O seu nível
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
              <TierIcon tier={atual.tier} className="h-6 w-6 shrink-0" />
              <span className="truncate">{atual.label}</span>
            </p>
            <p className="mt-1 text-xs" style={{ opacity: 0.8 }}>
              Temporada de {dia(status.season.start)} a {dia(status.season.end)}
            </p>
          </div>

          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold"
            style={{ background: 'rgba(255,255,255,0.18)' }}
            aria-hidden="true"
          >
            {tierIndex(atual.tier)}
          </div>
        </div>

        {/* A proteção dos 30 dias. Sem isto, o motorista não sabe que está com
            um prazo a correr — e a queda apanha-o de surpresa. */}
        {protegido && (
          <p
            className="mt-3 flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Vantagens de <strong>{mapa.get(status.floorTier!)?.label}</strong> garantidas até{' '}
              {dia(status.floorUntil)} ({status.floorDaysLeft} dia{status.floorDaysLeft === 1 ? '' : 's'}).
              Volte a atingir as metas para as manter.
            </span>
          </p>
        )}

        {/* O que falta para o próximo */}
        {proximo && status.next && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span style={{ opacity: 0.85 }}>Para {proximo.label}</span>
              <span className="tabular-nums" style={{ opacity: 0.85 }}>
                {Math.round(status.next.ratio * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, Math.round(status.next.ratio * 100))}%`, background: texto }}
              />
            </div>
            <ul className="mt-2 space-y-0.5 text-xs" style={{ opacity: 0.85 }}>
              {status.next.missing.seasonRevenue > 0 && (
                <li>Faltam {formatCurrency(status.next.missing.seasonRevenue)} de faturação nesta temporada</li>
              )}
              {status.next.missing.invested > 0 && (
                <li>Faltam {formatCurrency(status.next.missing.invested)} aplicados em investimentos</li>
              )}
              {status.next.missing.balance > 0 && (
                <li>Faltam {formatCurrency(status.next.missing.balance)} de saldo em conta</li>
              )}
              {status.next.missing.weeks > 0 && (
                <li>Faltam {status.next.missing.weeks} semana{status.next.missing.weeks === 1 ? '' : 's'} com fecho</li>
              )}
              {status.next.missing.documents && <li>Regularize os documentos expirados</li>}
            </ul>
          </div>
        )}

        {!proximo && (
          <p className="mt-4 text-sm" style={{ opacity: 0.85 }}>
            Está no nível mais alto. Mantenha as metas para continuar com todas as vantagens.
          </p>
        )}

        {/* Vantagens do nível atual */}
        {vantagens.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {vantagens.map((v) => (
              <li
                key={v}
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.18)' }}
              >
                {v}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="mt-4 flex items-center gap-1 rounded text-xs font-medium transition-opacity hover:opacity-100"
          style={{ opacity: 0.8 }}
        >
          Ver todos os níveis
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {/* A escada toda, para ele ver onde pode chegar. Fundo neutro: as cores
          dos outros níveis sobre o fundo deste ficariam ilegíveis. */}
      {aberto && (
        <Card className="rounded-none border-0 shadow-none">
          <CardContent className="space-y-3 p-4 sm:p-6">
            {configs.map((c) => {
              const eu = c.tier === status.tier;
              const metas = rankGoals(c, formatCurrency);
              const vs = rankPerks(c);
              return (
                <div
                  key={c.tier}
                  className={`rounded-lg border p-3 ${eu ? 'border-transparent' : 'border-border'}`}
                  style={eu ? { background: `${c.color}1A`, borderColor: c.color } : undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <RankBadge config={c} />
                    {eu && <span className="text-xs font-medium text-muted-foreground">O seu nível</span>}
                  </div>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-foreground">Metas</p>
                      <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                        {metas.length ? metas.map((m) => <li key={m}>{m}</li>) : <li>Nível de entrada</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Vantagens</p>
                      <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                        {vs.length ? vs.map((v) => <li key={v}>{v}</li>) : <li>—</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
