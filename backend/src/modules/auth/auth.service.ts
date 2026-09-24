// src/modules/auth/auth.service.ts
import bcrypt from 'bcrypt';
import { AppError }          from '../../shared/errors/AppError';
import { usersRepository }   from '../users/users.repository';
import { IUserPublic }       from '../users/users.types';
import { LoginInput, LoginResult } from './auth.types';
import { permissionsService } from '../permissions/permissions.service';
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
      user: { ...toPublicUser(user), permissions },
    };
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

  /**
   * Quem sou eu, e o que posso.
   *
   * As permissões vêm JUNTAS de propósito. O painel precisa delas para saber
   * que menu desenhar, e se fossem um segundo pedido haveria um instante em
   * que o menu está desenhado sem elas — a piscar entradas que a pessoa não
   * pode abrir. Vêm da base e não do token: tirar um acesso tem de fazer
   * efeito na próxima página, não na próxima sessão.
   */
  async me(userId: string): Promise<IUserPublic & { permissions: Record<string, string> }> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    const permissions = await permissionsService.grantsFor(userId, user.role);
    return { ...user, permissions };
  }
}

export const authService = new AuthService();