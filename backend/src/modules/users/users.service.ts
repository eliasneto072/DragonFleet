import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError';
import { CreateUserInput, UpdateUserInput } from './users.service.types';
import { CreateUserData, UpdateUserData } from './users.repository.types';
import { usersRepository } from './users.repository';
import { IUserPublic} from './users.types';
import { UserRole, UserStatus } from '../../shared/types/enums';

type Actor = {
  id: string;
  role?: UserRole;
};

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN;
}

export class UsersService {
  private async ensureUserExists(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return user;
  }

  async list(actor: Actor): Promise<IUserPublic[]> {
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

  async create(actor: Actor, input: CreateUserInput): Promise<IUserPublic> {
    if (!isAdmin(actor.role)) {
      throw new AppError('Forbidden', 403);
    }

    const existingUser = await usersRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError('Email already in use', 409, 'EMAIL_IN_USE');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const data: CreateUserData = {
        name: input.name,
        email: input.email,
        password: passwordHash,
        role: input.role ?? UserRole.DRIVER,
        status: input.status ?? UserStatus.ACTIVE,
    }

    return usersRepository.create(data);
  }

  async update(actor: Actor, id: string, input: UpdateUserInput): Promise<IUserPublic> {
    const isSelf = actor.id === id;

    if (!isAdmin(actor.role) && !isSelf) {
      throw new AppError('Forbidden', 403);
    }

    await this.ensureUserExists(id);

    if (!isAdmin(actor.role)) {
      const allowedFieldsForSelf: Array<keyof UpdateUserInput> = ['name', 'email', 'password']
      const keys = Object.keys(input) as Array<keyof UpdateUserInput>
      const allowed = keys.every((key) => allowedFieldsForSelf.includes(key))

      if (!allowed) {
        throw new AppError('Forbidden', 403, 'CANNOT_CHANGE_RESTRICTED_FIELDS');
      }
    }

    if (input.email) {
      const existingUser = await usersRepository.findByEmail(input.email);
      if (existingUser && existingUser.id !== id) {
        throw new AppError('Email already in use', 409, 'EMAIL_IN_USE');
      }
    }

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