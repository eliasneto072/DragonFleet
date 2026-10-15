// src/modules/leads/leads.service.ts
//
// Os contactos deixados no site.
//
// ─── ESTA É A ÚNICA ESCRITA VERDADEIRAMENTE PÚBLICA DO SISTEMA ──────────────
//
// O registo de um motorista exige um convite. Tudo o resto exige sessão. Isto
// não exige nada: qualquer pessoa na internet pode gravar uma linha aqui, e é
// suposto que possa — é um formulário de contacto.
//
// Daí três travões, e nenhum deles é decorativo:
//
//   1. O limite por IP, em `app.ts`. Sem ele, um script enche a tabela numa
//      noite e a lista de contactos deixa de servir para alguma coisa.
//   2. O campo-armadilha (`website`). Está escondido no formulário e nenhuma
//      pessoa o preenche; os robôs preenchem tudo o que encontram. Vindo
//      preenchido, responde-se que sim e não se grava nada — quem está a
//      atacar não aprende que foi apanhado.
//   3. O tamanho de cada campo, no schema. Uma mensagem de dez mil caracteres
//      não é um contacto.
//
// ─── E GUARDA POUCO DE PROPÓSITO ────────────────────────────────────────────
//
// Nome, contacto e uma frase. Tudo o que se pedir a mais é uma razão a mais
// para a pessoa desistir a meio — e é dado pessoal de alguém que ainda não é
// cliente de ninguém.

import { prisma } from '../../config/prisma';
import { comoSistema } from '../../config/escopo';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { idDaFrotaDaCasa } from '../../config/arranque';
import { comFrota } from '../../config/escopo';
import { avisarGestao } from '../../shared/services/avisos';

export type TipoDeContacto = 'MOTORISTA' | 'GESTOR';
export type EstadoDoContacto = 'NOVO' | 'FALADO' | 'GANHO' | 'PERDIDO';

export interface EntradaDoContacto {
  tipo: TipoDeContacto;
  nome: string;
  telefone: string;
  email?: string | null;
  mensagem?: string | null;
  /** O campo-armadilha. Preenchido = robô. Ver a nota no topo. */
  website?: string | null;
}

/**
 * Normaliza um número para comparar.
 *
 * Só para a guarda dos repetidos: o que se GRAVA é o que a pessoa escreveu,
 * porque é por aí que ela se reconhece quando lhe ligam de volta.
 */
function soDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

export class LeadsService {
  /**
   * Regista um contacto.
   *
   * ─── RESPONDE SEMPRE QUE SIM ──────────────────────────────────────────────
   *
   * Mesmo ao robô apanhado pela armadilha, e mesmo a quem já se tinha
   * inscrito. Uma resposta diferente ensina a quem está a testar o formulário
   * o que é que o faz passar — e, no caso do repetido, dizia a um estranho que
   * aquele número já está na lista, que não é coisa que lhe diga respeito.
   */
  async registar(entrada: EntradaDoContacto): Promise<{ ok: true }> {
    // ── A armadilha ──
    if (entrada.website && entrada.website.trim().length > 0) {
      logger.warn('[leads] contacto ignorado: campo-armadilha preenchido');
      return { ok: true };
    }

    const nome = entrada.nome.trim();
    const telefone = entrada.telefone.trim();
    const digitos = soDigitos(telefone);

    // Nove dígitos é um número português; o mínimo apanha o engano de dedo
    // sem recusar um número estrangeiro, que é mais comprido e não mais curto.
    if (digitos.length < 9) {
      throw new AppError('Indique um número de telefone válido.', 400, 'TELEFONE_INVALIDO');
    }

    // ── O mesmo contacto duas vezes ──
    //
    // Toda a gente carrega duas vezes no botão quando a resposta demora. Um
    // contacto do mesmo número nas últimas 24 horas é a mesma pessoa, e vale
    // mais actualizar o que ela escreveu do que ter duas linhas iguais.
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recente = await comoSistema(async () => await prisma.lead.findFirst({
      where: { phone: telefone, createdAt: { gte: ontem } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }));

    if (recente) {
      await comoSistema(async () => await prisma.lead.updateMany({
        where: { id: recente.id },
        data: {
          tipo: entrada.tipo,
          name: nome,
          email: entrada.email?.trim() || null,
          message: entrada.mensagem?.trim() || null,
        },
      }));
      return { ok: true };
    }

    await comoSistema(async () => await prisma.lead.create({
      data: {
        tipo: entrada.tipo,
        name: nome,
        phone: telefone,
        email: entrada.email?.trim() || null,
        message: entrada.mensagem?.trim() || null,
      },
    }));

    logger.info(`[leads] contacto novo (${entrada.tipo})`);

    // ── Avisar a administração ───────────────────────────────────────────
    //
    // Um pedido de contacto que ninguém vê é um cliente perdido. Até aqui,
    // ficava na base de dados à espera de que alguém abrisse o painel.
    //
    // A frota é a DA CASA, escolhida à mão e não pelo escopo: isto nasce do
    // formulário público, que corre em `comoSistema()` — ou seja, a ver todas
    // as frotas. Chamar `avisarGestao` aí mandava o contacto aos admins de
    // todos os clientes da plataforma. O lead é da casa; vai à casa.
    try {
      const casa = await idDaFrotaDaCasa();
      if (casa) {
        await comFrota(casa, () => avisarGestao({
          titulo: `Novo contacto do site (${entrada.tipo})`,
          mensagem: [
            `Nome: ${nome}`,
            telefone ? `Telefone: ${telefone}` : null,
            entrada.email?.trim() ? `Email: ${entrada.email.trim()}` : null,
            entrada.mensagem?.trim() ? `\n${entrada.mensagem.trim()}` : null,
          ].filter(Boolean).join('\n'),
        }));
      }
    } catch (erro) {
      // Um aviso que falha não pode fazer o formulário público dar erro a
      // quem o preencheu — o contacto já está guardado.
      logger.error('[leads] falhou o aviso à administração', erro);
    }

    return { ok: true };
  }

  /**
   * A lista, para o painel do dono.
   *
   * Os novos primeiro e, dentro desses, os mais antigos à frente: quem deixou
   * o número há três dias e ainda não teve resposta é quem está mais perto de
   * ligar a outra frota.
   */
  async listar(incluirFechados = false) {
    const linhas = await prisma.lead.findMany({
      where: incluirFechados ? {} : { status: { in: ['NOVO', 'FALADO'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });

    return linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo as TipoDeContacto,
      estado: l.status as EstadoDoContacto,
      nome: l.name,
      telefone: l.phone,
      email: l.email,
      mensagem: l.message,
      notas: l.notes,
      criadoEm: l.createdAt,
      fechadoEm: l.closedAt,
    }));
  }

  /** Quantos ainda não foram contactados. Para o número no menu. */
  async porResponder(): Promise<number> {
    return prisma.lead.count({ where: { status: 'NOVO' } });
  }

  /**
   * Muda o estado de um contacto, com uma nota.
   *
   * Não apaga, nem sequer os perdidos: daqui a um ano, saber que já se falou
   * com aquele número e não avançou poupa uma segunda chamada igual.
   */
  async actualizar(
    id: string,
    estado: EstadoDoContacto,
    notas?: string | null,
  ) {
    const fechado = estado === 'GANHO' || estado === 'PERDIDO';

    const { count } = await prisma.lead.updateMany({
      where: { id },
      data: {
        status: estado,
        ...(notas !== undefined ? { notes: notas?.trim() || null } : {}),
        closedAt: fechado ? new Date() : null,
      },
    });

    if (count === 0) {
      throw new AppError('Contacto não encontrado.', 404, 'LEAD_NAO_ENCONTRADO');
    }
    return { ok: true };
  }
}

export const leadsService = new LeadsService();
