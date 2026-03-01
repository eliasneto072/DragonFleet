import { prisma } from "../../config/prisma"
import { logger } from "../../shared/utils/logger"
import { IUserRepository } from "./users.repository.interfaces"
import { IUser, IUserPublic } from "./users.types"
import { CreateUserData, UpdateUserData } from "./users.repository.types"


export class UsersRepository  implements IUserRepository{

    private readonly publicSelect = {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
    } as const

    async findAll(): Promise<IUserPublic[]> {
        try{
            
            return await prisma.user.findMany({ select: this.publicSelect, orderBy: {createdAt: 'desc'} })

        } catch(err) {

            logger.error("Erro ao buscar usuários", err);
            throw err; // deixa middleware de erro tratar
        
        }
    }

    async findById(id: string): Promise<IUserPublic | null> {
        try {

            return await prisma.user.findUnique({
                where: {id},
                select: this.publicSelect
            })

        }catch(err){

            logger.error('Erro ao buscar usuário', err)
            throw err
        }
    }

    // esse retorna com password (usado apenas no auth/login)
    async findByEmail(email: string): Promise<IUser | null> {
        try{

            return await prisma.user.findUnique({ where: {email} })

        } catch(err){
            logger.error('Erro ao buscar usuário por email', err)
            throw err
        }
    }

    async create(data: CreateUserData): Promise<IUserPublic> {
    try {
      return await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          status: data.status,
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error("Erro ao criar usuário", err);
      throw err;
    }
  }

  async update(id: string, data: UpdateUserData): Promise<IUserPublic> {
    try {
      return await prisma.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.password !== undefined ? { password: data.password } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error("Erro ao atualizar usuário", err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.user.delete({ where: { id } });
    } catch (err) {
      logger.error("Erro ao deletar usuário", err);
      throw err;
    }
  }
}

export const usersRepository =  new UsersRepository()

