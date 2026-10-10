import { IUser, IUserPublic } from './users.types';
import { CreateUserData, UpdateUserData } from './users.repository.types';
import type { Transacao } from '../../config/prisma';

export interface IUserRepository {
  findAll(): Promise<IUserPublic[]>;
  findById(id: string): Promise<IUserPublic | null>;
  /** Inclui o hash da palavra-passe. Só para login e reautenticação. */
  findByIdWithPassword(id: string): Promise<IUser | null>;
  findByEmail(email: string): Promise<IUser | null>;
  /**
   * `cliente` existe para o registo por convite: a conta tem de nascer na
   * mesma transação que gastou o lugar do convite. Omitido, é o cliente normal.
   */
  create(data: CreateUserData, cliente?: Transacao): Promise<IUserPublic>;
  update(id: string, data: UpdateUserData): Promise<IUserPublic>;
  delete(id: string): Promise<void>;
}
