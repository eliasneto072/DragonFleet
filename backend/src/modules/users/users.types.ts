import { UserRole, UserStatus } from "../../shared/types/enums"



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
    
    //earnings?: IEarning[];
    //vehicles?: IVehicle[];
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

