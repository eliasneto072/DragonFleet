import { VehicleStatus } from "../../shared/types/enums"


export type CreateVehicleInput = {
    brand: string
    model: string
    plate: string
    year: number
    status?: VehicleStatus
    
    userId: string
}


export type UpdateVehicleInput = {
    brand?: string
    model?: string
    plate?: string
    year?: number
    status?: VehicleStatus
}