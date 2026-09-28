import { IUserPublic } from '../users/users.types';

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResult = {
  token: string;
  refreshToken: string;
  /** Com as permissões por área, para o painel saber já o que desenhar. */
  user: IUserPublic & { permissions: Record<string, string> };
};