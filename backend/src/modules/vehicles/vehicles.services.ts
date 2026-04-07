import { AppError } from "../../shared/errors/AppError";
import { Actor } from "../users/users.types";
import { VehiclesRepository } from "./vehicles.repository";

import {
  ICreateVehicleRepositoryDTO,
  IUpdateVehicleRepositoryDTO
} from "./vehicles.repository.types";

export class VehiclesService {

  constructor(private vehiclesRepository: VehiclesRepository) {}

  async create(data: ICreateVehicleRepositoryDTO) {

    const vehicleAlreadyExists = await this.vehiclesRepository.findByPlate(data.plate);

    if (vehicleAlreadyExists) {
      throw new AppError("Vehicle already exists with this plate", 409);
    }

    return this.vehiclesRepository.create(data);
  }

  async findAll(actor: Actor) { // ← NOVO PARÂMETRO

  return this.vehiclesRepository.findAllByUser(actor.id);

}

  //Bloquear visualização de veículo que não pertence ao usuário.
  async findById(
  actor: Actor,
  id: string,  
  vehicleId: string,
  loggedUserId: string // ← NOVO PARÂMETRO
) {

  const vehicle = await this.vehiclesRepository.findById(vehicleId);

  if (actor.id != id){
    throw new AppError('Unauthorizated', 401, 'Unauthorizated')

  }

  if (!vehicle) {
    throw new AppError("Vehicle not found", 404);
  }

  // 🔐 REGRA DE AUTORIZAÇÃO
  if (vehicle.userId !== loggedUserId) {
    throw new AppError("You are not allowed to view this vehicle", 403);
  }

  return vehicle;
}

  // 🔥 ALTERAÇÃO AQUI
  async update(
    actor:Actor,
    vehicleId: string,
    data: IUpdateVehicleRepositoryDTO,
    loggedUserId: string // ← NOVO PARÂMETRO
  ) {

    const vehicleExists = await this.vehiclesRepository.findById(vehicleId);

    if (!vehicleExists) {
      throw new AppError("Vehicle not found", 404);
    }

    // 🔥 REGRA DE AUTORIZAÇÃO
    if (vehicleExists.userId !== loggedUserId) {
      throw new AppError("You are not allowed to update this vehicle", 403);
    }

    if (data.plate) {
      const plateAlreadyExists = await this.vehiclesRepository.findByPlate(data.plate);

      if (plateAlreadyExists && plateAlreadyExists.id !== vehicleId) {
        throw new AppError("Another vehicle already uses this plate", 409);
      }
    }

    return this.vehiclesRepository.update(vehicleId, data);
  }

  // 🔥 APENAS O DONO DO VEÍCULO PODE ATUALIZAR A PLACA.
  async delete(
    actor:Actor,
    vehicleId: string,
    loggedUserId: string
  ) {

    const vehicleExists = await this.vehiclesRepository.findById(vehicleId);

    if (!vehicleExists) {
      throw new AppError("Vehicle not found", 404);
    }

    // 🔥 REGRA DE AUTORIZAÇÃO
    if (vehicleExists.userId !== loggedUserId) {
      throw new AppError("You are not allowed to delete this vehicle", 403);
    }

    await this.vehiclesRepository.delete(vehicleId);
  }
}