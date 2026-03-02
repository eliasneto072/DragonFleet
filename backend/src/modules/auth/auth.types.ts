import { IUserPublic } from '../users/users.types';

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResult = {
  token: string;
  user: IUserPublic;
};