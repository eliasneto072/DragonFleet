// src/app/components/driver/documents-management.tsx
//
// Painel de conformidade do motorista.
//
// MUDANÇA DE FUNDO: a tela iterava sobre `documents` — o que existe no banco —
// e por isso só mostrava o que já tinha sido enviado. Um motorista com dois
// dos cinco documentos via dois cartões e nenhuma pista de que faltavam três.
// Agora itera sobre DRIVER_DOCUMENT_TYPES e rende um slot por documento
// exigido, enviado ou não. É o que vehicle-documents.tsx já fazia.
//
// ORDEM: as linhas são ordenadas por urgência (rejeitado, expirado, em falta,
// em análise, aprovado). Antes seguiam a ordem devolvida pela API, e um
// documento rejeitado podia aparecer abaixo de dois aprovados.
//
// VEÍCULOS: esta tela RESUME os documentos do veículo, com uma linha de
// progresso por veículo e um atalho para a tela de Veículos. Não duplica o
// fluxo de envio: quem age sobre o carro age em Veículos.
//
// ESTADO "PRONTO PARA TRABALHAR": conta os documentos pessoais aprovados. Mas
// UserStatus também tem BLOCKED e INACTIVE, que um administrador pode aplicar
// por outro motivo — nesse caso a contagem diria "pronto" a quem não pode
// trabalhar. O estado da conta tem precedência sobre a contagem.
//
// RESPONSIVIDADE: no cartão de estado, só o rótulo e o título dividem a linha
// com a ilustração. Num ecrã de 360px sobram cerca de 185px nessa coluna, o
// suficiente para o título mas não para o progresso e as dicas — esses ficam
// abaixo, com a largura completa. Mesmo arranjo do hero do painel.
//
// MODO ESCURO: a trilha da barra de progresso usa bg-foreground/10 em vez de
// uma cor de superfície. Sobre um cartão já tingido, uma trilha derivada do
// fundo desaparece num dos dois temas.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  AlertCircle, Car, ChevronRight, ExternalLink, FileText, Loader2,
  RefreshCw, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  DOCUMENT_TYPE_LABELS, DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES, daysUntil, formatarValidade } from '@/shared/lib/document-labels';
import {
  DocumentStatusIcon, documentStateMeta, type DocumentSlotState,
} from '@/app/components/ui/document-status';
import { DocumentUploadDialog } from '@/app/components/ui/document-upload-dialog';
import { DocumentsIllustration } from '@/app/components/ui/documents-illustration';
import type { ApiDocument, DocumentType } from '@/shared/types/api';

/** Dias de antecedência a partir dos quais a validade vira aviso. */
const EXPIRY_WARNING_DAYS = 7;

function openDocument(id: string) {
  documentsService.openFile(id).catch((err: any) =>
    toast.error(err?.message ?? 'Erro ao abrir o documento.'),
  );
}

function cleanNote(notes?: string | null) {
  return notes?.replace('[avisado-7d]', '').trim() ?? '';
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DocumentsSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar os documentos…</span>

      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>

      <Skeleton className="h-44 w-full rounded-xl sm:h-40" />

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Linha de documento ────────────────────────────────────────────────────────

interface SlotRow {
  type: DocumentType;
  doc?: ApiDocument;
  state: DocumentSlotState;
  priority: number;
}

function DocumentRow({
  row,
  onUpload,
}: {
  row: SlotRow;
  onUpload: (type: DocumentType, isResubmit: boolean) => void;
}) {
  const meta = documentStateMeta(row.state);
  const name = DOCUMENT_TYPE_LABELS[row.type] ?? row.type;
  const note = cleanNote(row.doc?.notes);
  const showNote = row.state === 'REJECTED' && !!note;

  // Linha secundária: estado, mais validade quando existe.
  let subline = meta.label;
  if (row.doc?.expiresAt && row.state === 'APPROVED') {
    const dias = daysUntil(row.doc.expiresAt);
    const data = formatarValidade(row.doc.expiresAt);
    if (dias !== null && dias >= 0) {
      subline = dias <= EXPIRY_WARNING_DAYS
        ? `Aprovado · expira em ${dias} dia${dias === 1 ? '' : 's'}`
        : `Aprovado · válido até ${data}`;
    }
  } else if (row.state === 'PENDING' && row.doc) {
    subline = `Em análise desde ${new Date(row.doc.createdAt).toLocaleDateString('pt-PT')}`;
  }

  const expiringSoon =
    row.state === 'APPROVED' &&
    !!row.doc?.expiresAt &&
    (daysUntil(row.doc.expiresAt) ?? 99) <= EXPIRY_WARNING_DAYS;

  return (
    <li className="border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-3">
        <DocumentStatusIcon state={row.state} className="h-[18px] w-[18px]" />

        <div className="min-w-0 flex-1" title={name}>
          <p className="truncate text-sm font-medium">{name}</p>
          <p
            className={`truncate text-xs ${
              expiringSoon
                ? 'font-medium text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
            }`}
          >
            {subline}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {row.doc && (
            <Button
              variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => openDocument(row.doc!.id)}
              aria-label={`Ver ${name}`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {row.state === 'MISSING' && (
            <Button size="sm" className="h-8" onClick={() => onUpload(row.type, false)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Enviar
            </Button>
          )}
          {(row.state === 'REJECTED' || row.state === 'EXPIRED') && (
            <Button size="sm" className="h-8" onClick={() => onUpload(row.type, true)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Reenviar
            </Button>
          )}
        </div>
      </div>

      {showNote && (
        <p className="ml-[30px] mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="font-medium">Motivo da rejeição:</span> {note}
        </p>
      )}
    </li>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DocumentsManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [uploadType, setUploadType] = useState<DocumentType | null>(null);
  const [isResubmit, setIsResubmit] = useState(false);

  const documentsQuery = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn: () => documentsService.list(),
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn: () => vehiclesService.list(),
  });

  const documents = documentsQuery.data?.documents ?? [];
  const vehicles = vehiclesQuery.data?.vehicles ?? [];

  // Um slot por documento exigido, ordenado por urgência.
  const slots = useMemo<SlotRow[]>(() => {
    const personal = documents.filter((d) => !d.vehicleId);
    return DRIVER_DOCUMENT_TYPES
      .map((type) => {
        const doc = personal.find((d) => d.type === type);
        const state: DocumentSlotState = doc ? doc.status : 'MISSING';
        return { type, doc, state, priority: documentStateMeta(state).priority };
      })
      .sort((a, b) => a.priority - b.priority);
  }, [documents]);

  // Progresso por veículo — resumo apenas, a gestão acontece em Veículos.
  const vehicleRows = useMemo(() => {
    return vehicles.map((v) => {
      const own = documents.filter((d) => d.vehicleId === v.id);
      const approved = VEHICLE_DOCUMENT_TYPES.filter(
        (t) => own.find((d) => d.type === t)?.status === 'APPROVED',
      ).length;
      return { vehicle: v, approved, total: VEHICLE_DOCUMENT_TYPES.length };
    });
  }, [vehicles, documents]);

  if (documentsQuery.isLoading) return <DocumentsSkeleton />;

  if (documentsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar os documentos.</p>
        <Button variant="outline" onClick={() => documentsQuery.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const approvedCount = slots.filter((s) => s.state === 'APPROVED').length;
  const missingCount = slots.length - approvedCount;
  const accountBlocked = user?.status === 'BLOCKED' || user?.status === 'INACTIVE';

  const heroState = accountBlocked
    ? 'blocked'
    : missingCount === 0
      ? 'complete'
      : 'incomplete';

  const HERO_COPY = {
    blocked: {
      eyebrow: 'Conta indisponível',
      title: user?.status === 'BLOCKED' ? 'A sua conta está bloqueada' : 'A sua conta está inativa',
      hint: 'Fale com o suporte para regularizar a situação.',
      tint: 'bg-destructive/10',
      bar: 'bg-destructive',
    },
    complete: {
      eyebrow: 'Documentação em ordem',
      title: 'Está pronto para trabalhar',
      hint: 'Avisamos aqui se algum documento precisar de renovação.',
      tint: 'bg-success/10',
      bar: 'bg-success',
    },
    incomplete: {
      eyebrow: 'Ainda não pode começar a trabalhar',
      title: `Falta${missingCount === 1 ? '' : 'm'} ${missingCount} documento${missingCount === 1 ? '' : 's'}`,
      hint: 'Envie tudo para a sua conta ser libertada.',
      tint: 'bg-warning/10',
      bar: 'bg-warning',
    },
  }[heroState];

  const vehiclesMissing = vehicleRows.reduce((s, r) => s + (r.total - r.approved), 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Documentos"
        subtitle="Envie e acompanhe a sua documentação"
        icon={<FileText className="h-5 w-5" />}
      />

      {/* Estado de conformidade */}
      <div className={`overflow-hidden rounded-xl p-5 sm:p-6 ${HERO_COPY.tint}`}>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{HERO_COPY.eyebrow}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-3xl">
              {HERO_COPY.title}
            </p>
          </div>

          <DocumentsIllustration
            state={heroState}
            className="h-20 w-auto shrink-0 sm:h-28 lg:h-32"
          />
        </div>

        {!accountBlocked && (
          <>
            <div className="mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${HERO_COPY.bar}`}
                style={{ width: `${(approvedCount / slots.length) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {approvedCount} de {slots.length} aprovados
            </p>
          </>
        )}

        <p className="mt-2 text-sm text-muted-foreground">{HERO_COPY.hint}</p>

        {!accountBlocked && vehiclesMissing > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            O seu veículo tem mais {vehiclesMissing} documento
            {vehiclesMissing === 1 ? '' : 's'} por regularizar.
          </p>
        )}
      </div>

      {/* Documentos pessoais */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Os seus documentos</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Os que precisam de ação aparecem primeiro
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <ul>
            {slots.map((row) => (
              <DocumentRow
                key={row.type}
                row={row}
                onUpload={(type, resubmit) => {
                  setUploadType(type);
                  setIsResubmit(resubmit);
                }}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Documentos dos veículos — resumo com atalho */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Documentos dos veículos</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O envio é feito na tela de Veículos
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {vehiclesQuery.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              A carregar veículos…
            </div>
          ) : vehicleRows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Car className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Nenhum veículo registado ainda.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/app/driver/vehicles')}>
                Adicionar veículo
              </Button>
            </div>
          ) : (
            <ul>
              {vehicleRows.map(({ vehicle, approved, total }) => {
                const complete = approved === total;
                return (
                  <li key={vehicle.id} className="border-b border-border py-2 last:border-0">
                    <button
                      type="button"
                      onClick={() => navigate('/app/driver/vehicles')}
                      className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${complete ? 'bg-success' : 'bg-warning'}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {vehicle.brand} {vehicle.model}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono tracking-tight">{vehicle.plate}</span>
                          {' · '}
                          {approved} de {total} aprovados
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        Gerir
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <DocumentUploadDialog
        open={!!uploadType}
        onClose={() => setUploadType(null)}
        type={uploadType}
        isResubmit={isResubmit}
      />
    </div>
  );
}
