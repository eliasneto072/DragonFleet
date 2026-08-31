// src/app/components/ui/driver-avatar.tsx
//
// Fotografia do motorista, com as iniciais como recurso.
//
// A imagem vem do documento FOTO_PERFIL, que já é um dos exigidos — não faz
// sentido pedir a mesma fotografia duas vezes. É mostrada assim que enviada,
// mesmo por confirmar: o rosto certo por aprovar é mais útil do que duas letras.
//
// SOBRE A LISTA: o ficheiro é pedido com autenticação, por isso não dá para o
// pôr num `src` e deixar o browser tratar. Numa lista de cinquenta motoristas,
// cinquenta pedidos individuais seriam lentos e repetidos a cada montagem.
// Daí o cache em módulo: o mesmo documento é buscado uma vez por sessão, e as
// linhas seguintes reutilizam o object URL.
//
// Os URLs não são revogados enquanto a página vive. É deliberado: revogar ao
// desmontar partiria as outras linhas que apontam para o mesmo blob, e uma
// fotografia de perfil ronda algumas dezenas de KB. O cache é limpo quando a
// página é recarregada.

import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { documentsService } from '@/features/driver/services/documents.service';
import type { ApiDocument } from '@/shared/types/api';

/** documentId → object URL. Partilhado por todas as instâncias. */
const urlCache = new Map<string, string>();
/** Pedidos em curso, para duas linhas não buscarem o mesmo ficheiro. */
const inflight = new Map<string, Promise<string>>();

function loadPhoto(documentId: string): Promise<string> {
  const cached = urlCache.get(documentId);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(documentId);
  if (pending) return pending;

  const promise = documentsService
    .getFileObjectUrl(documentId)
    .then((url) => {
      urlCache.set(documentId, url);
      inflight.delete(documentId);
      return url;
    })
    .catch((err) => {
      inflight.delete(documentId);
      throw err;
    });

  inflight.set(documentId, promise);
  return promise;
}

/**
 * Encontra a fotografia de perfil de um motorista numa lista de documentos.
 *
 * `!d.vehicleId` exclui documentos de veículo: o tipo é pessoal, mas a
 * verificação evita depender disso.
 */
export function findProfilePhoto(
  documents: ApiDocument[] | undefined,
  userId: string,
): ApiDocument | undefined {
  return documents?.find(
    (d) =>
      d.userId === userId &&
      d.type === 'FOTO_PERFIL' &&
      !d.vehicleId &&
      (d.status === 'APPROVED' || d.status === 'PENDING'),
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

interface Props {
  name: string;
  /** Documento FOTO_PERFIL; sem ele mostram-se as iniciais. */
  photo?: ApiDocument;
  /** Lado em px. */
  size?: number;
  className?: string;
}

export function DriverAvatar({ name, photo, size = 36, className = '' }: Props) {
  const [url, setUrl] = useState<string | null>(
    photo ? urlCache.get(photo.id) ?? null : null,
  );

  useEffect(() => {
    if (!photo) { setUrl(null); return; }

    const cached = urlCache.get(photo.id);
    if (cached) { setUrl(cached); return; }

    let active = true;
    loadPhoto(photo.id)
      .then((u) => { if (active) setUrl(u); })
      .catch(() => { if (active) setUrl(null); });

    return () => { active = false; };
  }, [photo?.id]);

  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };

  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  const initials = initialsOf(name);

  return (
    <div
      style={style}
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700 dark:bg-emerald-950 dark:text-emerald-300 ${className}`}
    >
      {initials || <User style={{ width: size * 0.5, height: size * 0.5 }} />}
    </div>
  );
}
