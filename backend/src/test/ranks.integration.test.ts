// src/test/ranks.integration.test.ts
//
// Níveis: metas, subida e descida dentro da temporada, e a proteção de 30 dias
// depois de cada temporada.
//
// As datas são controladas passando o `now` ao serviço e mexendo na temporada
// guardada na linha do motorista — é a forma honesta de "saltar dois meses"
// sem mexer no relógio do processo.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaFecho } from './factories';
import { UserRole } from '../shared/types/enums';
import { ranksService } from '../modules/ranks/ranks.service';
import { dayToDate } from '../modules/ranks/ranks.math';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);
const asDriver = (id = motorista.id) => authHeader(id, UserRole.DRIVER);

/** Uma escada simples: só faturação da temporada. */
async function defineEscada() {
  const metas: Record<string, number> = {
    TIER_2: 5000, TIER_3: 10000, TIER_4: 20000, TIER_5: 40000,
  };
  for (const [tier, minSeasonRevenue] of Object.entries(metas)) {
    await request(app).patch(`/ranks/configs/${tier}`).set(asAdmin())
      .send({ minSeasonRevenue, requireValidDocuments: false }).expect(200);
  }
  await request(app).patch('/ranks/configs/TIER_1').set(asAdmin())
    .send({ requireValidDocuments: false }).expect(200);
}

/** Fecho dentro da temporada atual (a semana é fixa dentro do mês corrente). */
async function faturacao(valor: number, semana: string) {
  return criaFecho({
    userId: motorista.id,
    createdById: admin.id,
    weekStart: dayToDate(semana),
    uberAmount: valor,
  });
}

/** O primeiro dia da temporada a que uma data pertence. */
function inicioDaTemporada(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const inicio = m - ((m - 1) % 2);
  return `${y}-${String(inicio).padStart(2, '0')}-01`;
}

beforeEach(async () => {
  await resetDb();
  // A migração cria as cinco linhas de configuração; o TRUNCATE do harness
  // apaga-as, por isso voltam a ser criadas aqui.
  await testDb.rankConfig.createMany({
    data: [
      { tier: 'TIER_1', label: 'Dragon Driver', color: '#64748B' },
      { tier: 'TIER_2', label: 'Dragon Elite', color: '#2563EB' },
      { tier: 'TIER_3', label: 'Dragon Leader', color: '#0D6B4F' },
      { tier: 'TIER_4', label: 'Dragon Manager', color: '#B45309' },
      { tier: 'TIER_5', label: 'Dragon Master', color: '#7C3AED' },
    ],
  });
  admin = await criaAdmin();
  motorista = await criaMotorista();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('configuração', () => {
  it('só o ADMIN muda as metas', async () => {
    await request(app).patch('/ranks/configs/TIER_2').set(asDriver())
      .send({ minSeasonRevenue: 1 }).expect(403);
  });

  it('o motorista lê a escada, para saber o que lhe falta', async () => {
    const r = await request(app).get('/ranks/configs').set(asDriver()).expect(200);
    expect(r.body.data.configs).toHaveLength(5);
    expect(r.body.data.configs[0].tier).toBe('TIER_1');
    expect(r.body.data.configs[4].label).toBe('Dragon Master');
  });

  it('recusa uma cor que não é hexadecimal', async () => {
    await request(app).patch('/ranks/configs/TIER_2').set(asAdmin())
      .send({ color: 'azul' }).expect(400);
  });
});

describe('subir e descer dentro da temporada', () => {
  it('sem metas definidas, toda a gente fica no primeiro nível', async () => {
    const r = await request(app).get('/ranks/me').set(asDriver()).expect(200);
    expect(r.body.data.status.tier).toBe('TIER_1');
  });

  it('a faturação da temporada faz subir, e a subida é imediata', async () => {
    await defineEscada();
    const semana = `${inicioDaTemporada()}`;
    await faturacao(12000, semana);

    const r = await request(app).get('/ranks/me').set(asDriver()).expect(200);
    expect(r.body.data.status.tier).toBe('TIER_3');
    expect(r.body.data.status.metrics.seasonRevenue).toBeCloseTo(12000, 2);
    expect(r.body.data.status.next.tier).toBe('TIER_4');
  });

  it('cancelar o fecho faz descer no momento — dentro da temporada não há proteção', async () => {
    await defineEscada();
    const f = await faturacao(12000, inicioDaTemporada());
    await request(app).get('/ranks/me').set(asDriver()).expect(200);

    await testDb.weeklySettlement.update({ where: { id: f.id }, data: { status: 'CANCELLED' } });

    const r = await request(app).get('/ranks/me').set(asDriver()).expect(200);
    expect(r.body.data.status.tier).toBe('TIER_1');
  });

  it('a subida e a descida ficam no histórico', async () => {
    await defineEscada();
    // O primeiro cálculo cria a linha; não é uma subida e não gera evento.
    await ranksService.recompute(motorista.id);

    const f = await faturacao(25000, inicioDaTemporada());
    await ranksService.recompute(motorista.id);

    await testDb.weeklySettlement.update({ where: { id: f.id }, data: { status: 'CANCELLED' } });
    await ranksService.recompute(motorista.id);

    const r = await request(app).get(`/ranks/user/${motorista.id}/events`).set(asAdmin()).expect(200);
    const kinds = r.body.data.events.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain('UP');
    expect(kinds).toContain('DOWN');
  });

  it('documentos expirados travam a subida quando o nível o exige', async () => {
    await defineEscada();
    await request(app).patch('/ranks/configs/TIER_3').set(asAdmin())
      .send({ requireValidDocuments: true }).expect(200);
    await faturacao(15000, inicioDaTemporada());

    await testDb.document.create({
      data: {
        userId: motorista.id, type: 'CARTA_CONDUCAO', status: 'EXPIRED',
        fileUrl: 'https://x.local/d.pdf', fileKey: 'teste/d',
      },
    });

    const r = await request(app).get('/ranks/me').set(asDriver()).expect(200);
    expect(r.body.data.status.tier).toBe('TIER_2');
    expect(r.body.data.status.metrics.documentsOk).toBe(false);
  });
});

describe('a proteção de 30 dias', () => {
  // Estes testes passam o `now` ao serviço em vez de irem por HTTP: a proteção
  // depende do dia, e um teste que só passasse na primeira metade da temporada
  // seria um teste que falha sozinho daqui a um mês.
  const diaDaTemporada = (n: number) => {
    const d = new Date(`${inicioDaTemporada()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  /** Põe o motorista a acabar a temporada ANTERIOR num nível. */
  async function terminouTemporadaEm(tier: string) {
    const anterior = new Date(`${inicioDaTemporada()}T00:00:00Z`);
    anterior.setUTCMonth(anterior.getUTCMonth() - 2);
    await testDb.driverRank.create({
      data: {
        userId: motorista.id,
        tier: tier as never,
        earnedTier: tier as never,
        seasonStart: anterior,
      },
    });
  }

  it('o rank alcançado fica garantido, mesmo sem faturação na temporada nova', async () => {
    await defineEscada();
    await terminouTemporadaEm('TIER_4');

    const s = await ranksService.recompute(motorista.id, diaDaTemporada(1));

    expect(s.tier).toBe('TIER_4');          // garantido
    expect(s.earnedTier).toBe('TIER_1');    // a temporada nova começou do zero
    expect(s.floorTier).toBe('TIER_4');
    expect(s.floorDaysLeft).toBeGreaterThan(0);
  });

  it('a proteção não trava a subida', async () => {
    await defineEscada();
    await terminouTemporadaEm('TIER_2');
    await faturacao(45000, inicioDaTemporada());

    const s = await ranksService.recompute(motorista.id, diaDaTemporada(2));
    expect(s.tier).toBe('TIER_5');
  });

  it('acabados os 30 dias, o nível passa a ser o conquistado', async () => {
    await defineEscada();
    await terminouTemporadaEm('TIER_4');
    await ranksService.recompute(motorista.id, diaDaTemporada(1));

    // A temporada anterior acabou na véspera do dia 1, portanto a proteção
    // dura até ao dia 29 da temporada nova. No dia 31 já não vale.
    const s = await ranksService.recompute(motorista.id, diaDaTemporada(31));
    expect(s.tier).toBe('TIER_1');
    expect(s.floorTier).toBeNull();

    const ev = await request(app).get(`/ranks/user/${motorista.id}/events`).set(asAdmin()).expect(200);
    expect(ev.body.data.events.map((e: { kind: string }) => e.kind)).toContain('FLOOR_EXPIRED');
  });

  it('o fim da temporada fica registado', async () => {
    await defineEscada();
    await terminouTemporadaEm('TIER_3');
    await ranksService.recompute(motorista.id, diaDaTemporada(1));

    const ev = await request(app).get(`/ranks/user/${motorista.id}/events`).set(asAdmin()).expect(200);
    expect(ev.body.data.events.map((e: { kind: string }) => e.kind)).toContain('SEASON_END');
  });
});

describe('planos com nível mínimo', () => {
  async function planoDeNivel(minRank: string) {
    const r = await request(app).post('/investments/plans').set(asAdmin()).send({
      name: 'Plano de topo', type: 'FLEXIBLE', annualRate: 5, minRank,
    }).expect(201);
    return r.body.data.plan.id as string;
  }

  it('recusa aplicar a quem não tem o nível', async () => {
    await defineEscada();
    await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 1000 });
    const planId = await planoDeNivel('TIER_4');

    const r = await request(app).post('/investments').set(asDriver())
      .send({ planId, amount: 100 }).expect(400);
    expect(r.body.code).toBe('RANK_TOO_LOW');
  });

  it('aceita quando o nível chega — e a lista diz-lhe se está trancado', async () => {
    await defineEscada();
    await faturacao(25000, inicioDaTemporada());
    await ranksService.recompute(motorista.id);
    const planId = await planoDeNivel('TIER_4');

    const lista = await request(app).get('/investments/plans').set(asDriver()).expect(200);
    const plano = lista.body.data.plans.find((p: { id: string }) => p.id === planId);
    expect(plano.minRank).toBe('TIER_4');
    expect(plano.unlocked).toBe(true);

    await request(app).post('/investments').set(asDriver())
      .send({ planId, amount: 100 }).expect(201);
  });
});

describe('vista da administração', () => {
  it('conta os motoristas por nível', async () => {
    await defineEscada();
    await faturacao(25000, inicioDaTemporada());
    await ranksService.runDaily();

    const r = await request(app).get('/ranks/overview').set(asAdmin()).expect(200);
    const tier4 = r.body.data.counts.find((c: { tier: string }) => c.tier === 'TIER_4');
    expect(tier4.count).toBe(1);
    expect(r.body.data.drivers[0].name).toBe(motorista.name);
  });

  it('o motorista não vê a lista dos outros', async () => {
    await request(app).get('/ranks/overview').set(asDriver()).expect(403);
  });
});
