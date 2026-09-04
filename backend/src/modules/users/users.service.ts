import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError';
import { CreateUserInput, UpdateUserInput } from './users.service.types';
import { CreateUserData, UpdateUserData } from './users.repository.types';
import { usersRepository } from './users.repository';
import { Actor, IUserPublic } from './users.types';
import { UserRole, UserStatus } from '../../shared/types/enums';
import { parsePage, parseSearchTerms } from '../../shared/http/pagination';

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN;
}

/**
 * Quem trabalha no escritório: ADMIN ou MANAGER.
 *
 * A divisão entre os dois é esta: o MANAGER opera o dia a dia — documentos,
 * fechos, retiradas, IBANs, viaturas, notificações, suporte — e o ADMIN mexe
 * nas regras e nas pessoas: Configurações, Sociedades, o PDF financeiro e os
 * papéis. Todos os outros módulos já tratavam os dois assim; era este que
 * faltava.
 */
function isStaff(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class UsersService {
  private async ensureUserExists(id: string): Promise<IUserPublic> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return user;
  }

  /**
   * Uma página de utilizadores, com pesquisa e filtros.
   *
   * Devolve também as contagens por estado sobre a frota INTEIRA: os cartões
   * do topo da tela dizem quantos estão ativos e bloqueados, e contá-los a
   * partir da página faria esses números mudar conforme se navega.
   */
  async list(
    actor: Actor,
    filter: {
      role?: string; status?: string; search?: unknown;
      pending?: string; sort?: string;
      page?: unknown; pageSize?: unknown;
    } = {},
  ) {
    // isStaff e não isAdmin.
    //
    // Exigir ADMIN aqui deixava o MANAGER a aprovar retiradas de pessoas que
    // não conseguia ver: o backend já lhe dava as retiradas, os IBANs e os
    // documentos, mas a tela de Motoristas devolvia-lhe 403. Um papel que só
    // funciona em metade das telas é pior do que não existir.
    if (!isStaff(actor.role)) {
      throw new AppError('Forbidden', 403);
    }

    const page = parsePage({ page: filter.page, pageSize: filter.pageSize });
    const terms = parseSearchTerms(filter.search);

    const [pagina, counts] = await Promise.all([
      usersRepository.findManyPaged(
        {
          role: filter.role,
          status: filter.status,
          terms,
          pending: filter.pending === 'pending' || filter.pending === 'clear'
            ? filter.pending : undefined,
          sort: filter.sort === 'recent' ? 'recent' : 'name',
        },
        page,
      ),
      usersRepository.countDriversByStatus(),
    ]);

    return { ...pagina, counts };
  }

  /**
   * Todos, sem paginar.
   *
   * Fica para quem precisa mesmo da lista inteira — o emparelhamento de nomes
   * da extensão, por exemplo. Não deve ser usado por telas: foi assim que a de
   * Motoristas acabou a descarregar 2000 registos para mostrar 25.
   */
  async listAll(actor: Actor): Promise<IUserPublic[]> {
    // Também isStaff, pela mesma razão do list acima.
    //
    // Esta é a rota que alimenta os seletores de motorista dos formulários e
    // a tela de Documentos, que precisa dos nomes para os mostrar ao lado de
    // cada ficheiro. Um MANAGER que pode rever documentos e não consegue
    // saber de quem eles são fica com a tela em branco.
    if (!isStaff(actor.role)) {
      throw new AppError('Forbidden', 403);
    }
    return usersRepository.findAll();
  }

  async getById(actor: Actor, id: string): Promise<IUserPublic> {
    // A ficha de um motorista. Sem isto, o MANAGER via a lista e não conseguia
    // abrir ninguém — que é a mesma meia-funcionalidade que o list tinha.
    if (!isStaff(actor.role) && actor.id !== id) {
      throw new AppError('Forbidden', 403);
    }

    return this.ensureUserExists(id);
  }

  /**
   * Registo público. POST /users é chamado sem autenticação pela RegisterPage,
   * portanto o papel e o estado NUNCA podem vir do corpo do pedido.
   *
   * A versão anterior fazia `role: input.role ?? UserRole.DRIVER` com a
   * verificação de administrador comentada, o que permitia a qualquer pessoa
   * criar uma conta ADMIN enviando {"role":"ADMIN"} no registo.
   *
   * Se for preciso criar utilizadores com papel elevado, isso exige um
   * endpoint próprio, autenticado e com requireAdmin — não este.
   */
  async create(input: CreateUserInput): Promise<IUserPublic> {
    const existingUser = await usersRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError('Email already in use', 409, 'EMAIL_IN_USE');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const data: CreateUserData = {
      name: input.name,
      email: input.email,
      password: passwordHash,
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
    };

    return usersRepository.create(data);
  }

  /**
   * Confirma a palavra-passe atual antes de uma alteração sensível.
   *
   * Sem isto, possuir o token bastava para trocar a palavra-passe e o email —
   * e como o email é o canal de recuperação, o dono legítimo ficava sem
   * caminho de volta. O token vive no localStorage do navegador, portanto uma
   * sessão esquecida num computador partilhado era suficiente.
   */
  private async assertCurrentPassword(id: string, currentPassword?: string): Promise<void> {
    if (!currentPassword) {
      throw new AppError(
        'Confirme a sua palavra-passe atual',
        400,
        'CURRENT_PASSWORD_REQUIRED',
      );
    }

    const user = await usersRepository.findByIdWithPassword(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new AppError(
        'Palavra-passe atual incorreta',
        401,
        'INVALID_CURRENT_PASSWORD',
      );
    }
  }

  async update(actor: Actor, id: string, input: UpdateUserInput): Promise<IUserPublic> {
    const isSelf = actor.id === id;

    if (!isAdmin(actor.role) && !isSelf) {
      throw new AppError('Forbidden', 403);
    }

    const current = await this.ensureUserExists(id);

    if (!isAdmin(actor.role)) {
      const allowedFieldsForSelf: Array<keyof UpdateUserInput> = [
        'name',
        'email',
        'password',
        'currentPassword',
      ];
      const keys = Object.keys(input) as Array<keyof UpdateUserInput>;
      const allowed = keys.every((key) => allowedFieldsForSelf.includes(key));

      if (!allowed) {
        throw new AppError('Forbidden', 403, 'CANNOT_CHANGE_RESTRICTED_FIELDS');
      }
    }

    // Reautenticação só quando é a própria conta. Um administrador a repor a
    // palavra-passe de um motorista não conhece a antiga; exigi-la aqui
    // quebraria a reposição administrativa.
    const changingPassword = input.password !== undefined;
    const changingEmail = input.email !== undefined && input.email !== current.email;

    if (isSelf && (changingPassword || changingEmail)) {
      await this.assertCurrentPassword(id, input.currentPassword);
    }

    if (input.email) {
      const existingUser = await usersRepository.findByEmail(input.email);
      if (existingUser && existingUser.id !== id) {
        throw new AppError('Email already in use', 409, 'EMAIL_IN_USE');
      }
    }

    await this.assertRoleChangeIsSafe(actor, current, input);

    // currentPassword é credencial de confirmação, não campo persistido.
    const data: UpdateUserData = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    if (input.password) {
      data.password = await bcrypt.hash(input.password, 10);
    }

    return usersRepository.update(id, data);
  }

  /**
   * Duas maneiras de o sistema ficar sem administrador, e as duas são um clique.
   *
   * A primeira: alguém muda o próprio papel. Não há aviso, não há confirmação
   * do lado do servidor, e o painel fecha-se atrás dele no pedido seguinte.
   * Quem se quiser despromover pede a outro administrador — assim há sempre
   * duas pessoas a saber que aconteceu.
   *
   * A segunda: o último ADMIN é despromovido ou desativado por outro. Aí não
   * fica ninguém capaz de mexer nas Configurações, gerir as Sociedades ou criar
   * outro administrador, e a única saída é editar a base de dados à mão.
   *
   * A contagem é de admins ATIVOS: um admin desativado não consegue entrar,
   * portanto não serve de saída de emergência.
   */
  private async assertRoleChangeIsSafe(
    actor: Actor,
    current: IUserPublic,
    input: { role?: UserRole; status?: UserStatus },
  ): Promise<void> {
    const isSelf = actor.id === current.id;

    if (isSelf && input.role !== undefined && input.role !== current.role) {
      throw new AppError(
        'Não pode alterar o seu próprio papel. Peça a outro administrador.',
        400,
        'CANNOT_CHANGE_OWN_ROLE',
      );
    }

    if (isSelf && input.status !== undefined && input.status !== UserStatus.ACTIVE) {
      throw new AppError(
        'Não pode desativar a sua própria conta.',
        400,
        'CANNOT_DEACTIVATE_SELF',
      );
    }

    if (current.role !== UserRole.ADMIN) return;

    const aDespromover = input.role !== undefined && input.role !== UserRole.ADMIN;
    const aDesativar = input.status !== undefined && input.status !== UserStatus.ACTIVE;
    if (!aDespromover && !aDesativar) return;

    await this.assertNotLastAdmin(current);
  }

  private async assertNotLastAdmin(alvo: IUserPublic): Promise<void> {
    if (alvo.role !== UserRole.ADMIN || alvo.status !== UserStatus.ACTIVE) return;

    const ativos = await usersRepository.countActiveByRole(UserRole.ADMIN);
    if (ativos <= 1) {
      throw new AppError(
        'Este é o único administrador ativo. Promova outra conta antes de mexer nesta.',
        400,
        'LAST_ACTIVE_ADMIN',
      );
    }
  }

  async remove(actor: Actor, id: string): Promise<void> {
    if (!isAdmin(actor.role)) {
      throw new AppError('Forbidden', 403);
    }

    const alvo = await this.ensureUserExists(id);

    if (actor.id === id) {
      throw new AppError('Não pode apagar a sua própria conta.', 400, 'CANNOT_DELETE_SELF');
    }

    await this.assertNotLastAdmin(alvo);

    return usersRepository.delete(id);
  }
}

export const usersService = new UsersService();