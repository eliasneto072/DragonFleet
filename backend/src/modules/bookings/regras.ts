// src/modules/bookings/regras.ts
//
// Quem pode fazer o quê a uma marcação, e em que estado.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque há cinco perfis e seis estados, e as perguntas que interessam são
// todas da forma "o mecânico da oficina B pode concluir uma marcação da
// oficina A?". Escritas entre consultas à base de dados, essas perguntas
// testam-se com uma base de dados inteira montada à volta. Escritas aqui,
// testam-se em três linhas — e é a diferença entre haver trinta testes ou
// haver três.
//
// ─── O ERRO QUE ISTO EXISTE PARA EVITAR ─────────────────────────────────────
//
// Uma oficina a ver os carros que foram à outra. Não dá erro, não dá aviso:
// dá um mecânico a saber o que não lhe diz respeito, e um cliente a perguntar
// porque é que a concorrência sabe da frota dele.

export type Perfil = 'ADMIN' | 'MANAGER' | 'SUPPORT' | 'DRIVER' | 'MECHANIC' | 'INVESTOR';

export type Estado =
  | 'PENDENTE' | 'NOVA_DATA_PROPOSTA' | 'CONFIRMADA'
  | 'CONCLUIDA' | 'CANCELADA' | 'RECUSADA';

export type Logistica = 'MOTORISTA_LEVA' | 'OFICINA_RECOLHE' | 'EMPRESA_LEVA';

/** Quem está a pedir, e o que lhe pertence. */
export interface Quem {
  id: string;
  role: Perfil;
  /** A oficina de um mecânico. Nulo nos outros perfis. */
  workshopId?: string | null;
}

/** A marcação, na parte que as regras precisam de saber. */
export interface Marcacao {
  status: Estado;
  workshopId: string;
  driverId: string | null;
  createdById: string;
}

/** Gestão da frota: vê tudo e manda em tudo. */
export const ehGestao = (p: Perfil) => p === 'ADMIN' || p === 'MANAGER';

/** Vê, não mexe. O suporte entra aqui para poder responder a um ticket. */
export const podeVer = (p: Perfil) => ehGestao(p) || p === 'SUPPORT';

/**
 * Esta pessoa pode ver esta marcação?
 *
 * ─── A REGRA DO MECÂNICO ───────────────────────────────────────────────────
 *
 * Só as da oficina DELE, e um mecânico sem oficina não vê nada. O `null` é
 * tratado explicitamente porque, sem isso, uma conta mal configurada
 * (`workshopId` nulo) compararia `null === null` com uma marcação cuja oficina
 * também fosse nula — e a comparação dava verdade. A marcação nunca tem
 * oficina nula, mas confiar nisso é confiar num detalhe de outra tabela.
 */
export function podeVerMarcacao(quem: Quem, m: Marcacao): boolean {
  if (quem.role === 'INVESTOR') return false;
  if (podeVer(quem.role)) return true;

  if (quem.role === 'MECHANIC') {
    if (!quem.workshopId) return false;
    return quem.workshopId === m.workshopId;
  }

  // O motorista vê as do carro dele e as que ele próprio pediu.
  if (quem.role === 'DRIVER') {
    return m.driverId === quem.id || m.createdById === quem.id;
  }

  return false;
}

/** Estados em que a marcação ainda está viva. */
const ABERTAS: Estado[] = ['PENDENTE', 'NOVA_DATA_PROPOSTA', 'CONFIRMADA'];
export const estaAberta = (e: Estado) => ABERTAS.includes(e);

/**
 * A oficina pode responder a isto?
 *
 * Só ao que ainda está por confirmar. Uma marcação já confirmada não volta a
 * ser aceite — e uma concluída muito menos: deixaria a oficina a reabrir
 * trabalho que já foi pago.
 */
export function podeResponderOficina(quem: Quem, m: Marcacao): boolean {
  if (quem.role !== 'MECHANIC') return false;
  if (!quem.workshopId || quem.workshopId !== m.workshopId) return false;
  return m.status === 'PENDENTE' || m.status === 'NOVA_DATA_PROPOSTA';
}

/**
 * A gestão confirma a marcação sem esperar pela oficina.
 *
 * ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
 *
 * Porque a oficina nem sempre está no sistema. Combina-se por telefone, o
 * mecânico diz "traga o carro na quinta às nove", e depois a marcação fica
 * PENDENTE à espera de uma confirmação que nunca vai chegar — porque quem a
 * daria já a deu, pelo telefone.
 *
 * Sem esta saída, a administração tinha de escolher entre deixar a marcação
 * pendente para sempre ou inventar uma conta de mecânico para a confirmar a si
 * própria. As duas são piores.
 *
 * ─── O QUE ISTO NÃO É ───────────────────────────────────────────────────────
 *
 * Não é o mecânico a ser dispensado: é a administração a assumir, em nome
 * dela, que a oficina já concordou. Por isso o serviço marca estas de outra
 * maneira e o aviso diz "confirmada pela administração" e não "pela oficina" —
 * quem olhar para o histórico daqui a seis meses tem de conseguir distinguir
 * uma confirmação que a oficina deu de uma que a administração assumiu.
 */
export function podeConfirmarPelaGestao(quem: Quem, m: Marcacao): boolean {
  if (!ehGestao(quem.role)) return false;
  // Os mesmos estados em que a oficina poderia responder, e só esses. Uma
  // marcação já confirmada não se volta a confirmar, e uma concluída ou
  // cancelada muito menos.
  return m.status === 'PENDENTE' || m.status === 'NOVA_DATA_PROPOSTA';
}

/**
 * Quem aceita a hora que a oficina contrapôs?
 *
 * Quem pediu, ou a gestão. O mecânico NÃO: seria ele a propor e ele a aceitar,
 * que é o mesmo que ter mudado a data sozinho — exactamente o que a
 * contraproposta existe para impedir.
 */
export function podeAceitarProposta(quem: Quem, m: Marcacao): boolean {
  if (m.status !== 'NOVA_DATA_PROPOSTA') return false;
  if (ehGestao(quem.role)) return true;
  return quem.role === 'DRIVER' && m.createdById === quem.id;
}

/**
 * Concluir: dizer que foi feito, quanto custou, e anexar a factura.
 *
 * A oficina e a gestão. O motorista não — não é ele que emite a factura, e um
 * custo escrito por quem não o pagou é um número em que não se pode confiar.
 */
export function podeConcluir(quem: Quem, m: Marcacao): boolean {
  if (m.status !== 'CONFIRMADA') return false;
  if (ehGestao(quem.role)) return true;
  return quem.role === 'MECHANIC'
    && !!quem.workshopId
    && quem.workshopId === m.workshopId;
}

/**
 * Cancelar.
 *
 * A gestão cancela o que quiser. O motorista cancela o que PEDIU — e só
 * enquanto estiver aberta. Depois de concluída não há o que cancelar: o
 * trabalho foi feito e, provavelmente, pago.
 */
export function podeCancelar(quem: Quem, m: Marcacao): boolean {
  if (!estaAberta(m.status)) return false;
  if (ehGestao(quem.role)) return true;
  return quem.role === 'DRIVER' && m.createdById === quem.id;
}

/** Recusar é da oficina, e só ao que ainda não confirmou. */
export function podeRecusar(quem: Quem, m: Marcacao): boolean {
  return podeResponderOficina(quem, m);
}

/**
 * Escolher quem acompanha o motorista.
 *
 * Só a gestão, e é o ponto todo: o acompanhamento existe porque há carros em
 * nome da empresa que são dos motoristas, e certas coisas exigem lá um
 * responsável. Deixar o motorista escolher quem o acompanha seria deixá-lo
 * nomear o responsável da empresa.
 */
export const podeDesignarAcompanhante = (quem: Quem) => ehGestao(quem.role);

/**
 * A logística que este perfil pode escolher ao criar.
 *
 * O motorista leva sempre o carro. Foi o que o cliente pediu — "ele tem de
 * levar sempre o carro, e pedir assistência se precisar" — e faz sentido: o
 * carro está com ele, e mandar a oficina buscá-lo é uma despesa que a empresa
 * é que decide.
 */
export function logisticasPermitidas(p: Perfil): Logistica[] {
  if (ehGestao(p)) return ['MOTORISTA_LEVA', 'OFICINA_RECOLHE', 'EMPRESA_LEVA'];
  if (p === 'DRIVER') return ['MOTORISTA_LEVA'];
  return [];
}

export const podeCriar = (p: Perfil) => ehGestao(p) || p === 'DRIVER';
