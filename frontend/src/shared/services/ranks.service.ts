// src/shared/services/ranks.service.ts
//
// Níveis (ranks): a escada, o estado de cada motorista e a vista da gestão.

import { apiClient } from '@/shared/lib/api-client';

export type Tier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4' | 'TIER_5';

export const TIERS: Tier[] = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'];

export function tierIndex(t: Tier): number {
  return TIERS.indexOf(t) + 1;
}

export interface RankConfig {
  tier: Tier;
  label: string;
  /** Cor base em #RRGGBB. É daqui que sai o fundo do cartão e o emblema. */
  color: string;
  minSeasonRevenue: number;
  minInvested: number;
  minBalance: number;
  minWeeks: number;
  requireValidDocuments: boolean;
  fuelDiscount: number;
  vehicleDiscount: number;
  tollsDiscount: number;
  investmentRateBonus: number;
  perks: string | null;
}

export interface RankMetrics {
  seasonRevenue: number;
  invested: number;
  balance: number;
  weeks: number;
  documentsOk: boolean;
}

export interface RankStatus {
  userId: string;
  userName?: string;
  tier: Tier;
  earnedTier: Tier;
  floorTier: Tier | null;
  floorUntil: string | null;
  floorDaysLeft: number;
  season: { start: string; end: string };
  metrics: RankMetrics;
  next: {
    tier: Tier;
    /** 0 a 1: a meta mais atrasada. */
    ratio: number;
    missing: {
      seasonRevenue: number;
      invested: number;
      balance: number;
      weeks: number;
      documents: boolean;
    };
  } | null;
}

export interface RankEvent {
  id: string;
  kind: 'UP' | 'DOWN' | 'SEASON_END' | 'FLOOR_EXPIRED';
  tier: Tier;
  fromTier: Tier | null;
  note: string | null;
  createdAt: string;
}

export interface RankDriver {
  userId: string;
  name: string;
  email: string;
  status: string;
  tier: Tier;
  earnedTier: Tier;
  floorTier: Tier | null;
  floorUntil: string | null;
  seasonRevenue: number;
  invested: number;
  balance: number;
  weeks: number;
  documentsOk: boolean;
  updatedAt: string;
}

export const ranksService = {
  configs(): Promise<{ configs: RankConfig[] }> {
    return apiClient.get('/ranks/configs');
  },
  updateConfig(tier: Tier, input: Partial<Omit<RankConfig, 'tier'>>): Promise<{ config: RankConfig }> {
    return apiClient.patch(`/ranks/configs/${tier}`, input);
  },
  me(): Promise<{ status: RankStatus }> {
    return apiClient.get('/ranks/me');
  },
  forUser(userId: string): Promise<{ status: RankStatus }> {
    return apiClient.get(`/ranks/user/${userId}`);
  },
  events(userId: string): Promise<{ events: RankEvent[] }> {
    return apiClient.get(`/ranks/user/${userId}/events`);
  },
  overview(filter: { tier?: Tier; search?: string } = {}): Promise<{
    drivers: RankDriver[];
    counts: { tier: Tier; count: number }[];
    season: { start: string; end: string };
  }> {
    const q = new URLSearchParams();
    if (filter.tier) q.set('tier', filter.tier);
    if (filter.search?.trim()) q.set('search', filter.search.trim());
    const qs = q.toString();
    return apiClient.get(`/ranks/overview${qs ? `?${qs}` : ''}`);
  },
};
