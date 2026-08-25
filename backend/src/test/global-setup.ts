// src/test/global-setup.ts
//
// Corre uma vez antes da suite de integração: aplica as migrações à base de
// testes. Uma vez e não por ficheiro — migrar é lento e o esquema não muda
// entre testes.

import { applyMigrations } from './harness';

export default function setup() {
  applyMigrations();
}
