// src/modules/auth/auth.service.ts
import bcrypt from 'bcrypt';
import { AppError }          from '../../shared/errors/AppError';
import { usersRepository }   from '../users/users.repository';
import { comoSistema }       from '../../config/escopo';
import { IUserPublic }       from '../users/users.types';
import { LoginInput, LoginResult } from './auth.types';
import { permissionsService } from '../permissions/permissions.service';
import { prisma } from '../../config/prisma';
import { capacidadeDaFrota } from '../system/capacidade';
import { idDaFrotaDaCasa } from '../../config/arranque';
import {
  ensureUserCanLogin,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  toPublicUser,
} from './auth.helpers';

/**
 * O que o painel precisa de saber sobre a frota da sessão.
 *
 * ─── PORQUE É QUE VEM COM O UTILIZADOR E NÃO À PARTE ────────────────────────
 *
 * Pela mesma razão que as permissões: o menu precisa disto para saber o que
 * desenhar. Num segundo pedido, haveria um instante com o menu já desenhado
 * sem esta resposta — a mostrar menus que a frota não comprou, e a escondê-los
 * um piscar de olhos depois.
 *
 * O que vai aqui é só o que o painel usa para decidir o que mostrar. Nada
 * disto autoriza coisa nenhuma: quem decide é o servidor, em `plano.middleware`,
 * que lê o plano da base de dados a cada pedido. Mexer nestes valores no
 * browser dá um menu bonito que responde 403.
 */
export interface FrotaDaSessao {
  id: string;
  nome: string;
  slug: string;
  /** A frota da casa, e não a de um cliente. */
  daCasa: boolean;
  /** Os códigos das funcionalidades que o plano inclui. */
  funcionalidades: string[];
  /** `false` com a assinatura expirada: lê-se tudo, não se escreve nada. */
  podeEscrever: boolean;
  assinatura: { estado: string; dias: number | null };
  /** Último dia pago. `null` sem assinatura — é o caso da casa. */
  terminaEm: string | null;
}

/**
 * A frota de uma sessão, pelo id.
 *
 * Atravessa frotas de propósito: lê UMA frota, pelo id que a conta de quem
 * pergunta já tem. Não é uma lista e não aceita filtros.
 */
async function frotaDaSessao(fleetId: string): Promise<FrotaDaSessao | null> {
  const f = await comoSistema(async () => await prisma.fleet.findUnique({
    where: { id: fleetId },
    select: {
      id: true, name: true, slug: true, subscriptionEndsOn: true,
      plan: { select: { features: true } },
    },
  }));
  if (!f) return null;

  const c = capacidadeDaFrota({
    features: f.plan?.features ?? null,
    subscriptionEndsOn: f.subscriptionEndsOn,
  });

  return {
    id: f.id,
    nome: f.name,
    slug: f.slug,
    daCasa: f.id === await idDaFrotaDaCasa(),
    funcionalidades: c.funcionalidades,
    podeEscrever: c.podeEscrever,
    assinatura: { estado: c.assinatura.estado, dias: c.assinatura.dias },
    terminaEm: f.subscriptionEndsOn
      ? f.subscriptionEndsOn.toISOString().slice(0, 10)
      : null,
  };
}

export class AuthService {
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await usersRepository.findByEmail(input.email);
    if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const passwordMatch = await bcrypt.compare(input.password, user.password);
    if (!passwordMatch) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    ensureUserCanLogin(user.status);

    const accessToken  = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    // As permissões vão já na resposta do login.
    //
    // Sem isto haveria uma janela entre entrar e o primeiro /auth/me em que o
    // painel não sabe o que a pessoa pode — e desenharia um menu vazio. O
    // sintoma seria "entrei e não tenho nada", que é indistinguível de um
    // problema de permissões a sério.
    const permissions = await permissionsService.grantsFor(user.id, user.role);

    return {
      token: accessToken,
      refreshToken,
      user: {
        ...toPublicUser(user),
        permissions,
        // Vai já no login, pela mesma razão das permissões: sem isto haveria
        // uma janela entre entrar e o primeiro /auth/me em que o painel não
        // sabe o que a frota comprou — e desenhava menus a mais, para os
        // esconder um instante depois.
        frota: await frotaDaSessao(user.fleetId),
      },
    };
  }

  async refresh(refreshToken: string): Promise<{ token: string }> {
    const payload = verifyRefreshToken(refreshToken);
    // ─── ATRAVESSA FROTAS, E TEM DE SER ──────────────────────────────────
    //
    // O refresh chega sem token de acesso, por isso ainda não há frota
    // definida — é esta leitura que a descobriria. Procura UM utilizador por
    // um id que veio de um refresh token já verificado: não é uma lista, e não
    // há aqui nada de uma frota a chegar a outra.
    const user    = await comoSistema(async () => await usersRepository.findById(payload.sub));

    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    ensureUserCanLogin(user.status);

    const newAccessToken = generateAccessToken(user.id, user.role);
    return { token: newAccessToken };
  }

  async logout(): Promise<void> {
    // JWT stateless — cliente remove os tokens
  }

  /**
   * Quem sou eu, e o que posso.
   *
   * As permissões vêm JUNTAS de propósito. O painel precisa delas para saber
   * que menu desenhar, e se fossem um segundo pedido haveria um instante em
   * que o menu está desenhado sem elas — a piscar entradas que a pessoa não
   * pode abrir. Vêm da base e não do token: tirar um acesso tem de fazer
   * efeito na próxima página, não na próxima sessão.
   */
  async me(userId: string): Promise<
    IUserPublic & { permissions: Record<string, string>; frota: FrotaDaSessao | null }
  > {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    const [permissions, frota] = await Promise.all([
      permissionsService.grantsFor(userId, user.role),
      frotaDaSessao(user.fleetId),
    ]);

    return { ...user, permissions, frota };
  }
}

export const authService = new AuthService();