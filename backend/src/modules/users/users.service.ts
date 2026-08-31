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
    if (!isAdmin(actor.role)) {
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
    if (!isAdmin(actor.role)) {
      throw new AppError('Forbidden', 403);
    }
    return usersRepository.findAll();
  }

  async getById(actor: Actor, id: string): Promise<IUserPublic> {
    if (!isAdmin(actor.role) && actor.id !== id) {
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

  async remove(actor: Actor, id: string): Promise<void> {
    if (!isAdmin(actor.role)) {
      throw new AppError('Forbidden', 403);
    }

    await this.ensureUserExists(id);

    return usersRepository.delete(id);
  }
}

export const usersService = new UsersService();