// src/modules/auth/auth.service.ts
import bcrypt from 'bcrypt';
import { AppError }          from '../../shared/errors/AppError';
import { usersRepository }   from '../users/users.repository';
import { IUserPublic }       from '../users/users.types';
import { LoginInput, LoginResult } from './auth.types';
import {
  ensureUserCanLogin,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  toPublicUser,
} from './auth.helpers';

export class AuthService {
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await usersRepository.findByEmail(input.email);
    if (!user) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const passwordMatch = await bcrypt.compare(input.password, user.password);
    if (!passwordMatch) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    ensureUserCanLogin(user.status);

    const accessToken  = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    return { token: accessToken, refreshToken, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<{ token: string }> {
    const payload = verifyRefreshToken(refreshToken);
    const user    = await usersRepository.findById(payload.sub);

    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    ensureUserCanLogin(user.status);

    const newAccessToken = generateAccessToken(user.id, user.role);
    return { token: newAccessToken };
  }

  async logout(): Promise<void> {
    // JWT stateless — cliente remove os tokens
  }

  async me(userId: string): Promise<IUserPublic> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    return user;
  }
}

export const authService = new AuthService();