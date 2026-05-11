import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from '../../shared/errors/AppError';
import { env } from '../../config/env';
import { IUserPublic } from '../users/users.types';
import { UserRole, UserStatus } from '../../shared/types/enums';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function generateAccessToken(userId: string, role: UserRole) {
  return jwt.sign(
    { role },
    env.JWT_SECRET,
    {
      subject: userId,
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],

      //issuer: env.JWT_ISSUER,
      //audience: env.JWT_AUDIENCE,
      
    }
  );
}

export function toPublicUser(user: AuthUser): IUserPublic {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function ensureUserCanLogin(status: UserStatus) {
  if (status === UserStatus.BLOCKED) {
    throw new AppError('User is blocked', 403, 'USER_BLOCKED');
  }

  if (status === UserStatus.INACTIVE) {
    throw new AppError('User is inactive', 403, 'USER_INACTIVE');
  }
}