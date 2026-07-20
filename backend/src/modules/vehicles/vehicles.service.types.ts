import { VehicleStatus } from "../../shared/types/enums"


export type CreateVehicleInput = {
    brand: string
    model: string
    plate: string
    year: number
    vin?: string | null
    status?: VehicleStatus
}


export type UpdateVehicleInput = {
    brand?: string
    model?: string
    plate?: string
    year?: number
    vin?: string | null
    status?: VehicleStatus
}
