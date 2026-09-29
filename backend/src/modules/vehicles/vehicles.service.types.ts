import { VehicleStatus } from "../../shared/types/enums"


export type CreateVehicleInput = {
    brand: string
    model: string
    plate: string
    year: number
    vin?: string | null
    status?: VehicleStatus
    /** Encargo semanal. Só a gestão o define — ver vehicles.service. */
    weeklyFee?: number
  energyType?: 'FUEL' | 'ELECTRIC' | 'HYBRID'
}


export type UpdateVehicleInput = {
    brand?: string
    model?: string
    plate?: string
    year?: number
    vin?: string | null
    status?: VehicleStatus
    weeklyFee?: number
  energyType?: 'FUEL' | 'ELECTRIC' | 'HYBRID'
}
