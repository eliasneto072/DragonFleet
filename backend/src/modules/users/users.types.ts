import { UserRole, UserStatus } from "../../shared/types/enums"
import { IVehicle } from "../vehicles/vehicles.types"



export interface IUser {

    id: string
    name: string
    email: string
    password: string
    createdAt: Date
    updatedAt: Date

    role: UserRole
    status: UserStatus


    // Relacionamentos
    
    vehicles?: IVehicle[];
    //earnings?: IEarning[];
    //notifications?: INotification[];
    //documents?: IDocument[];
    //withdrawals?: IWithdrawal[];

}

export type IUserPublic = Omit<IUser, 'password'>;

// Quem está executando a ação
export type Actor = {
  id: string;
  role?: UserRole;
};

