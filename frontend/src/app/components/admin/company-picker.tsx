// src/app/components/admin/company-picker.tsx
//
// Escolha da sociedade a quem o recibo verde foi emitido.
//
// Usado em dois sítios — o diálogo de aprovação e a correção na tela de
// Recibos Verdes — e por isso vive à parte dos dois.
//
// TRÊS TIPOS DE ESCOLHA, e a diferença entre a segunda e a terceira é o que
// esta tela tem de deixar claro:
//   uma sociedade da lista
//   "Outra", com texto livre
//   "Nenhum" — o recibo não foi emitido a nenhuma sociedade do grupo
//
// "Nenhum" é uma escolha e não uma omissão. Quem não classifica deixa a
// retirada em "por classificar", que é um estado diferente e aparece assim no
// registo. Sem essa distinção não se saberia o que falta preencher.

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Building2 } from 'lucide-react';
import { companiesService } from '@/shared/services/companies.service';
import { queryKeys } from '@/shared/lib/query-keys';

/** O que o formulário devolve. Ambos nulos = "Nenhum". */
export interface CompanyChoice {
  companyId: string | null;
  companyOther: string | null;
}

/** Não escolheu nada ainda — diferente de ter escolhido "Nenhum". */
export const NO_CHOICE = '__unset__';
const NONE = '__none__';
const OTHER = '__other__';

interface Props {
  value: CompanyChoice | null;
  onChange: (value: CompanyChoice | null) => void;
  disabled?: boolean;
  label?: string;
}

export function CompanyPicker({ value, onChange, disabled = false, label }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.companies.active,
    queryFn: () => companiesService.list(false),
  });

  const companies = data?.companies ?? [];

  // Qual das opções está selecionada. Derivado do valor, para o componente
  // poder ser controlado de fora sem guardar a escolha em dois sítios.
  const selected =
    value === null ? NO_CHOICE
      : value.companyId ? value.companyId
        : value.companyOther !== null ? OTHER
          : NONE;

  const [otherText, setOtherText] = useState(value?.companyOther ?? '');

  useEffect(() => {
    if (value?.companyOther != null) setOtherText(value.companyOther);
  }, [value?.companyOther]);

  function pick(option: string) {
    if (option === NONE) return onChange({ companyId: null, companyOther: null });
    if (option === OTHER) return onChange({ companyId: null, companyOther: otherText });
    return onChange({ companyId: option, companyOther: null });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const options = [
    ...companies.map((c) => ({ key: c.id, label: c.name })),
    { key: NONE, label: 'Nenhum' },
    { key: OTHER, label: 'Outra (escrever)' },
  ];

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {label ?? 'Recibo verde emitido a'}
      </Label>

      {/* Botões de rádio e não um dropdown: são poucas opções e todas têm de
          estar à vista. Num dropdown, "Nenhum" fica escondido atrás de um
          clique e quem tem pressa escolhe a primeira da lista sem pensar. */}
      <div
        role="radiogroup"
        aria-label="Sociedade do recibo verde"
        className="space-y-1.5 rounded-lg border border-border p-2"
      >
        {options.map((o) => (
          <label
            key={o.key}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
              selected === o.key ? 'bg-secondary font-medium' : 'hover:bg-muted/50'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="company-choice"
              className="h-3.5 w-3.5 shrink-0 accent-current"
              checked={selected === o.key}
              disabled={disabled}
              onChange={() => pick(o.key)}
            />
            <span className="min-w-0 truncate">{o.label}</span>
          </label>
        ))}
      </div>

      {selected === OTHER && (
        <Input
          value={otherText}
          disabled={disabled}
          autoFocus
          placeholder="Nome da sociedade"
          onChange={(e) => {
            setOtherText(e.target.value);
            onChange({ companyId: null, companyOther: e.target.value });
          }}
        />
      )}

      {companies.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Ainda não há sociedades registadas. Acrescente-as em Recibos Verdes.
        </p>
      )}
    </div>
  );
}

/** A escolha está completa? "Outra" sem texto não conta. */
export function isChoiceComplete(value: CompanyChoice | null): boolean {
  if (value === null) return false;
  if (value.companyId) return true;
  if (value.companyOther !== null) return value.companyOther.trim().length > 0;
  return true; // "Nenhum"
}
