import { IVehicle } from "./vehicles.types";
import{
    ICreateVehicleRepositoryDTO,
    IUpdateVehicleRepositoryDTO,
    IFindVehicleRepositoryFilters,
} from "./vehicles.repository.types";


export interface IVehicleRepository {
    create(data: ICreateVehicleRepositoryDTO): Promise<IVehicle>;

    update(
        id: string,
        data: IUpdateVehicleRepositoryDTO
    ): Promise<IVehicle>;

    findById(id: string): Promise<IVehicle>;

    findAll(
        filters?: IFindVehicleRepositoryFilters
    ): Promise<IVehicle[]>;

    delete(id: string): Promise<void>;
    
}

