import { IUser, IUserPublic } from './users.types';
import { CreateUserData, UpdateUserData } from './users.repository.types';

export interface IUserRepository {
  findAll(): Promise<IUserPublic[]>;
  findById(id: string): Promise<IUserPublic | null>;
  findByEmail(email: string): Promise<IUser | null>;
  create(data: CreateUserData): Promise<IUserPublic>;
  update(id: string, data: UpdateUserData): Promise<IUserPublic>;
  delete(id: string): Promise<void>;
}