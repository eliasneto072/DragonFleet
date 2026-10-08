// src/modules/bookings/regras.test.ts
//
// Quem pode fazer o quê a uma marcação.
//
// O teste que mais importa aqui não é nenhum dos que confirmam que as coisas
// funcionam — é o grupo "a oficina errada", que confirma que NÃO funcionam.
// Um mecânico a ver os carros que foram à oficina do lado não dá erro nenhum:
// dá informação da frota a quem não tem nada com ela.

import { describe, it, expect } from 'vitest';
import {
  podeVerMarcacao, podeResponderOficina, podeAceitarProposta, podeConcluir,
  podeCancelar, podeDesignarAcompanhante, logisticasPermitidas, podeCriar,
  type Quem, type Marcacao, type Estado,
} from './regras';

const admin: Quem = { id: 'a1', role: 'ADMIN' };
const gestor: Quem = { id: 'g1', role: 'MANAGER' };
const suporte: Quem = { id: 's1', role: 'SUPPORT' };
const motorista: Quem = { id: 'm1', role: 'DRIVER' };
const outroMotorista: Quem = { id: 'm2', role: 'DRIVER' };
const mecanicoA: Quem = { id: 'k1', role: 'MECHANIC', workshopId: 'ofA' };
const mecanicoB: Quem = { id: 'k2', role: 'MECHANIC', workshopId: 'ofB' };
const mecanicoSemOficina: Quem = { id: 'k3', role: 'MECHANIC', workshopId: null };
const investidor: Quem = { id: 'i1', role: 'INVESTOR' };

/** Uma marcação da oficina A, do motorista m1, criada por ele. */
function marcacao(status: Estado, extra: Partial<Marcacao> = {}): Marcacao {
  return { status, workshopId: 'ofA', driverId: 'm1', createdById: 'm1', ...extra };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('quem vê o quê', () => {
  it('a gestão e o suporte veem tudo', () => {
    const m = marcacao('PENDENTE');
    expect(podeVerMarcacao(admin, m)).toBe(true);
    expect(podeVerMarcacao(gestor, m)).toBe(true);
    expect(podeVerMarcacao(suporte, m)).toBe(true);
  });

  it('o investidor não vê nada', () => {
    expect(podeVerMarcacao(investidor, marcacao('PENDENTE'))).toBe(false);
  });

  it('o motorista vê as do carro dele', () => {
    expect(podeVerMarcacao(motorista, marcacao('PENDENTE'))).toBe(true);
  });

  it('o motorista vê as que ele pediu, mesmo de outro carro', () => {
    // Acontece quando o carro muda de mãos depois de marcado.
    const m = marcacao('PENDENTE', { driverId: 'm9', createdById: 'm1' });
    expect(podeVerMarcacao(motorista, m)).toBe(true);
  });

  it('o motorista NÃO vê as dos outros', () => {
    expect(podeVerMarcacao(outroMotorista, marcacao('PENDENTE'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a oficina errada', () => {
  const m = marcacao('PENDENTE');   // da oficina A

  it('o mecânico da A vê', () => {
    expect(podeVerMarcacao(mecanicoA, m)).toBe(true);
  });

  it('o mecânico da B NÃO vê', () => {
    expect(podeVerMarcacao(mecanicoB, m)).toBe(false);
  });

  it('o mecânico da B não confirma, não recusa, não conclui', () => {
    expect(podeResponderOficina(mecanicoB, m)).toBe(false);
    expect(podeConcluir(mecanicoB, marcacao('CONFIRMADA'))).toBe(false);
  });

  it('um mecânico SEM oficina não vê nada', () => {
    // Uma conta mal configurada tem de mostrar menos, não mais.
    expect(podeVerMarcacao(mecanicoSemOficina, m)).toBe(false);
    expect(podeResponderOficina(mecanicoSemOficina, m)).toBe(false);
  });

  it('e não vê uma marcação cuja oficina fosse nula', () => {
    // A marcação nunca tem oficina nula, mas a regra não depende disso.
    const semOficina = marcacao('PENDENTE', { workshopId: null as unknown as string });
    expect(podeVerMarcacao(mecanicoSemOficina, semOficina)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('confirmar e contrapor', () => {
  it('a oficina responde ao que está pendente', () => {
    expect(podeResponderOficina(mecanicoA, marcacao('PENDENTE'))).toBe(true);
  });

  it('e também ao que ela própria contrapôs', () => {
    expect(podeResponderOficina(mecanicoA, marcacao('NOVA_DATA_PROPOSTA'))).toBe(true);
  });

  it('mas não ao que já está confirmado', () => {
    expect(podeResponderOficina(mecanicoA, marcacao('CONFIRMADA'))).toBe(false);
  });

  it('nem ao que já foi concluído', () => {
    expect(podeResponderOficina(mecanicoA, marcacao('CONCLUIDA'))).toBe(false);
  });

  it('o motorista não responde pela oficina', () => {
    expect(podeResponderOficina(motorista, marcacao('PENDENTE'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('aceitar a hora que a oficina contrapôs', () => {
  const proposta = marcacao('NOVA_DATA_PROPOSTA');

  it('quem pediu aceita', () => {
    expect(podeAceitarProposta(motorista, proposta)).toBe(true);
  });

  it('a gestão aceita', () => {
    expect(podeAceitarProposta(admin, proposta)).toBe(true);
  });

  // ─── O que a contraproposta existe para impedir ───────────────────────
  it('a oficina NÃO aceita a própria proposta', () => {
    // Seria ela a propor e ela a aceitar, ou seja, mudar a data sozinha.
    expect(podeAceitarProposta(mecanicoA, proposta)).toBe(false);
  });

  it('não há nada a aceitar quando não houve proposta', () => {
    expect(podeAceitarProposta(admin, marcacao('PENDENTE'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('concluir', () => {
  it('a oficina conclui o que confirmou', () => {
    expect(podeConcluir(mecanicoA, marcacao('CONFIRMADA'))).toBe(true);
  });

  it('a gestão também', () => {
    expect(podeConcluir(admin, marcacao('CONFIRMADA'))).toBe(true);
  });

  it('o motorista não — não é ele que emite a factura', () => {
    expect(podeConcluir(motorista, marcacao('CONFIRMADA'))).toBe(false);
  });

  it('só o que está confirmado se conclui', () => {
    expect(podeConcluir(mecanicoA, marcacao('PENDENTE'))).toBe(false);
    expect(podeConcluir(admin, marcacao('CONCLUIDA'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('cancelar', () => {
  it('a gestão cancela o que estiver aberto', () => {
    for (const e of ['PENDENTE', 'NOVA_DATA_PROPOSTA', 'CONFIRMADA'] as Estado[]) {
      expect(podeCancelar(admin, marcacao(e))).toBe(true);
    }
  });

  it('o motorista cancela o que pediu', () => {
    expect(podeCancelar(motorista, marcacao('CONFIRMADA'))).toBe(true);
  });

  it('mas não o que a empresa marcou', () => {
    const daEmpresa = marcacao('CONFIRMADA', { createdById: 'a1' });
    expect(podeCancelar(motorista, daEmpresa)).toBe(false);
  });

  it('nada se cancela depois de concluído', () => {
    expect(podeCancelar(admin, marcacao('CONCLUIDA'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('acompanhamento e logística', () => {
  it('só a gestão escolhe quem acompanha', () => {
    expect(podeDesignarAcompanhante(admin)).toBe(true);
    expect(podeDesignarAcompanhante(gestor)).toBe(true);
    expect(podeDesignarAcompanhante(motorista)).toBe(false);
    expect(podeDesignarAcompanhante(mecanicoA)).toBe(false);
  });

  it('o motorista leva sempre o carro', () => {
    expect(logisticasPermitidas('DRIVER')).toEqual(['MOTORISTA_LEVA']);
  });

  it('a gestão escolhe as três', () => {
    expect(logisticasPermitidas('ADMIN')).toHaveLength(3);
  });

  it('a oficina e o investidor não marcam nada', () => {
    expect(podeCriar('MECHANIC')).toBe(false);
    expect(podeCriar('INVESTOR')).toBe(false);
    expect(logisticasPermitidas('MECHANIC')).toEqual([]);
  });

  it('a gestão e o motorista marcam', () => {
    expect(podeCriar('ADMIN')).toBe(true);
    expect(podeCriar('DRIVER')).toBe(true);
  });
});
