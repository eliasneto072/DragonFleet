// src/features/admin/services/reminders.service.ts
//
// Lembretes que insistem até alguém os dar por feitos.
//
// São de quem os criou e de mais ninguém: uma nota que uma pessoa deixa a si
// própria, não uma tarefa atribuída a outra.

import { apiClient } from '@/shared/lib/api-client';

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  /** A partir de que dia começa a avisar. */
  dueOn: string;
  /** Preenchido quando foi concluído. */
  doneAt: string | null;
  createdAt: string;
}

export const remindersService = {
  /** Por omissão só os que faltam fazer — é isso que um painel mostra. */
  list(todos = false): Promise<{ reminders: Reminder[] }> {
    return apiClient.get(`/reminders${todos ? '?all=true' : ''}`);
  },

  /** Sem `dueOn`, é para hoje. */
  create(input: { title: string; notes?: string | null; dueOn?: string }): Promise<{ reminder: Reminder }> {
    return apiClient.post('/reminders', input);
  },

  /** `done: false` reabre — o engano mais provável aqui é carregar na linha errada. */
  setDone(id: string, done: boolean): Promise<{ reminder: Reminder }> {
    return apiClient.patch(`/reminders/${id}`, { done });
  },

  remove(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete(`/reminders/${id}`);
  },
};
