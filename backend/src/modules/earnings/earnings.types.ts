import { EarningPlatform } from '../../shared/types/enums';
import { IUserPublic } from '../users/users.types';

export interface IEarning {
  id: string;
  amount: number;
  date: Date;
  platform: EarningPlatform;
  userId: string;
  createdAt: Date;
}

export type IEarningPublic = IEarning;

export type IEarningWithUser = IEarning & {
  user?: IUserPublic;
};