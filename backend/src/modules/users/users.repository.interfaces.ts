import { IUser,IUserPublic } from "./users.types";
import { CreateUserDTO, UpdateUserDTO } from "./users.dto";


export interface IUserRepository {

    findAll(): Promise<IUserPublic[]>
    findById(id: string): Promise<IUserPublic | null>

    // para login (precisa do password)
    findByEmail(email: string): Promise<IUser | null>;

    create(data: CreateUserDTO): Promise<IUserPublic>
    update(id: string, data: UpdateUserDTO): Promise<IUserPublic | null>
    delete(id: string): Promise<void>

 }