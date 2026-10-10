import { IUserPublic } from '../users/users.types';
import type { FrotaDaSessao } from './auth.service';

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResult = {
  token: string;
  refreshToken: string;
  /**
   * Com as permissões por área E o que a frota comprou, para o painel saber
   * já o que desenhar — ver a nota em `frotaDaSessao`.
   */
  user: IUserPublic & {
    permissions: Record<string, string>;
    frota: FrotaDaSessao | null;
  };
};