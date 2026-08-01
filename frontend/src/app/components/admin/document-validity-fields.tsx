// src/app/components/admin/document-validity-fields.tsx
//
// Datas de validade preenchidas pela administração ao rever um documento.
//
// POR QUE AQUI E NÃO NO ENVIO: antes, o motorista escrevia a data de emissão do
// Registo Criminal e o sistema somava 90 dias. Isso assumia que ele conhece a
// data e que o prazo é sempre o mesmo, e deixava sem validade todos os outros
// documentos — embora a carta de condução, o certificado TVDE e a inspeção
// também caduquem, sem que ninguém fosse avisado.
//
// Quem tem o ficheiro à frente é quem revê. A emissão fica opcional porque nem
// sempre está legível; a validade é o que dispara os avisos.
//
// A ESCOLHA EXPLÍCITA: aprovar sem data é legítimo — há documentos vitalícios —
// mas não pode ser o caminho por omissão, senão um documento fica para sempre
// sem avisar ninguém por distração de quem aprovou. Daí os dois botões: ou se
// indica a validade, ou se declara que não expira.

import { useEffect, useState } from 'react';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Button } from '@/app/components/ui/button';
import { CalendarClock, Infinity as InfinityIcon } from 'lucide-react';

export interface ValidityValue {
  /** "YYYY-MM-DD" ou null. */
  issuedAt: string | null;
  /** "YYYY-MM-DD" ou null. null com neverExpires = documento sem validade. */
  expiresAt: string | null;
  /** True quando a administração declarou que o documento não caduca. */
  neverExpires: boolean;
}

export const EMPTY_VALIDITY: ValidityValue = {
  issuedAt: null,
  expiresAt: null,
  neverExpires: false,
};

/** "2026-07-06T00:00:00.000Z" → "2026-07-06". */
function toInput(iso?: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function validityFromDocument(doc: {
  issuedAt?: string | null;
  expiresAt?: string | null;
  status?: string;
}): ValidityValue {
  return {
    issuedAt: toInput(doc.issuedAt),
    expiresAt: toInput(doc.expiresAt),
    // Um documento já aprovado sem data foi declarado sem validade; um ainda
    // por rever apenas não tem data nenhuma, e o estado começa por decidir.
    neverExpires: doc.status === 'APPROVED' && !doc.expiresAt,
  };
}

/** Pronto para aprovar: ou tem validade, ou foi declarado sem validade. */
export function isValidityDecided(v: ValidityValue): boolean {
  return v.neverExpires || !!v.expiresAt;
}

interface Props {
  value: ValidityValue;
  onChange: (v: ValidityValue) => void;
}

export function DocumentValidityFields({ value, onChange }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [showDates, setShowDates] = useState(!value.neverExpires);

  useEffect(() => {
    setShowDates(!value.neverExpires);
  }, [value.neverExpires]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/50 p-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Validade do documento</p>
      </div>

      {showDates ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-issued">
                Emissão <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="doc-issued"
                type="date"
                max={value.expiresAt ?? today}
                value={value.issuedAt ?? ''}
                onChange={(e) => onChange({ ...value, issuedAt: e.target.value || null })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-expires">Válido até</Label>
              <Input
                id="doc-expires"
                type="date"
                min={value.issuedAt ?? undefined}
                value={value.expiresAt ?? ''}
                onChange={(e) => onChange({ ...value, expiresAt: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Avisamos o motorista 7 dias antes de expirar.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() =>
                onChange({ ...value, expiresAt: null, neverExpires: true })
              }
            >
              <InfinityIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Não expira
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <InfinityIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Documento sem validade
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange({ ...value, neverExpires: false })}
          >
            Indicar validade
          </Button>
        </div>
      )}
    </div>
  );
}
