import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError';
import { usersRepository } from '../users/users.repository';
import { IUserPublic } from '../users/users.types';
import { LoginInput, LoginResult } from './auth.types';
import {
  ensureUserCanLogin,
  generateAccessToken,
  toPublicUser,
} from './auth.helpers';

export class AuthService {
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await usersRepository.findByEmail(input.email);

    if (!user) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password);

    if (!passwordMatch) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    ensureUserCanLogin(user.status);

    const token = generateAccessToken(user.id, user.role);

    return {
      token,
      user: toPublicUser(user),
    };
  }

  async logout(): Promise<void> {
    // JWT stateless:
    // o backend não invalida o token sozinho.
    // O cliente deve remover o token armazenado.
    return;
  }

  async me(userId: string): Promise<IUserPublic> {
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return user;
  }
}

export const authService = new AuthService();