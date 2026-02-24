



export interface IUser {

    id: string
    name: string
    email: string
    password: string
    createdAt: Date
    updatedAt: Date

    //role: UserRole
    //status: UserStatus


    // Relacionamentos
    
    //earnings?: IEarning[];
    //vehicles?: IVehicle[];
    //notifications?: INotification[];
    //documents?: IDocument[];
    //withdrawals?: IWithdrawal[];

}

export type IUserPublic = Omit<IUser, "password"> 