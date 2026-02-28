import bcrypt from 'bcrypt';
import { AppError } from "../../shared/errors/AppError"
import { CreateUserDTO, UpdateUserDTO } from "./users.dto"
import { usersRepository} from "./users.repository"
import { IUserPublic } from "./users.types"
import { UserRole, UserStatus } from '../../shared/types/enums';


type Actor = {
    id: string
    role?: string
}

function isAdmin(role?: string) {
    return role === UserRole.ADMIN
}

export class UsersService {


    async list(actor: Actor): Promise<IUserPublic[]> {

        if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403)

        return usersRepository.findAll()
    }

    async getById(actor: Actor, id: string): Promise<IUserPublic> {

        if(!isAdmin(actor.role) && actor.id !== id) throw new AppError('Forbidden', 403)
        
        const user = await usersRepository.findById(id)

        if(!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
        
        return user

    }
    
    async create(actor: Actor, data: CreateUserDTO): Promise<IUserPublic> {

        if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403);

        const exist = await usersRepository.findByEmail(data.email)
        if (exist) throw new AppError('Email already in use', 409, 'EMAIL_IN_USE')

        const passwordHash = await bcrypt.hash(data.password, 10)

        return usersRepository.create({
            name: data.name,
            email: data.email,
            password: passwordHash,
            role: data.role ?? ('DRIVER' as UserRole),
            status: data.status ?? ('ACTIVE' as UserStatus)
        })

    }

    async update(actor: Actor, id: string, data: UpdateUserDTO): Promise<IUserPublic> {

        const isSelf = actor.id === id
        
        if (!isAdmin(actor.role) && !isSelf) throw new AppError('Forbidden', 403);


        // if not admin, only allow changing name
        if (!isAdmin(actor.role)) {
            const keys = Object.keys(data)
            const allowed = keys.every((k) => k === 'name')
            if (!allowed) throw new AppError('Forbidden', 403, 'CANNOT_CHANGE_ROLE_OR_STATUS');
        }

        const existing = await usersRepository.findById(id)
        if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

        return usersRepository.update(id, data)

    }

    async remove(actor: Actor, id: string): Promise<void> {
        if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403);

        const existing = await usersRepository.findById(id)
        if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        
        return usersRepository.delete(id)
    }


}

export const usersService = new UsersService()