// Dados mínimos pra criar usuário (sem Partial + sem !)
export type CreateUserDTO = {
    name: string
    email: string
    password: string; // (por enquanto) - ideal: enviar hash do service

}

// Dados permitidos para update (evita atualizar id/createdAt etc.)
export type UpdateUserDTO = {
    name?: string
    email?: string
    password?: string; // cuidado: service deveria hash antes
}