// src/app/components/ui/file-picker.tsx
//
// Seleção de um ficheiro: área clicável, validação de formato e tamanho, e o
// ficheiro escolhido com opção de remover.
//
// POR QUE EXISTE: o comprovativo do IBAN e o recibo verde precisavam do mesmo
// bloco que o document-upload-dialog já tinha por dentro. O projeto já passou
// por isto uma vez — havia duas cópias da dropzone, em documents-management e
// vehicle-documents, e tinham divergido nos rótulos antes de serem unidas.
// Copiar mais duas vezes era repetir o erro com o problema já conhecido.
//
// O componente valida e devolve; não sabe para onde o ficheiro vai nem quem o
// envia. Quem o usa trata da mutação.
//
// O document-upload-dialog continua com a versão dele: passa a usar esta
// quando se fizer a migração dos fetch crus, que é assunto de outro commit.
//
// OS min-w-0 NÃO SÃO SUPÉRFLUOS. O DialogContent deste projeto é um grid, e
// itens de grid nascem com min-width:auto — não encolhem abaixo da largura
// mínima do conteúdo. O truncate do nome aplica white-space:nowrap, portanto
// essa largura mínima é o nome INTEIRO. Um ficheiro com um nome comprido e
// sem espaços empurrava o formulário para fora do painel do diálogo: o fundo
// branco e os cantos ficavam na largura antiga e os campos saíam por fora.
// Cada min-w-0 abaixo é um elo dessa cadeia; tirar um traz o problema de volta.

import { useRef } from 'react';
import { Label } from '@/app/components/ui/label';
import { AlertCircle, Paperclip, Upload, X } from 'lucide-react';

/** O que o multer aceita e faz sentido para um comprovativo. */
export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_SIZE_MB = 10;

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Valida um ficheiro escolhido. Devolve a mensagem de erro, ou null se serve.
 *
 * Exportada para quem precise de validar fora do componente — por exemplo
 * antes de submeter, quando o ficheiro veio do estado e não do input.
 */
export function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return 'Formato inválido. Use JPEG, PNG, WebP ou PDF.';
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `Ficheiro demasiado grande. Máximo ${MAX_SIZE_MB} MB.`;
  }
  return null;
}

interface Props {
  label: string;
  /** Texto de ajuda por baixo do título, quando não há ficheiro escolhido. */
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Erro de validação, mostrado por baixo da área. */
  error?: string;
  onError: (message: string) => void;
  disabled?: boolean;
  /** Liga o Label ao input, para o clique no título abrir o seletor. */
  id: string;
}

export function FilePicker({
  label, hint, file, onChange, error, onError, disabled = false, id,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    onError('');
    onChange(null);
    if (!selected) return;

    const problem = validateFile(selected);
    if (problem) {
      onError(problem);
      return;
    }
    onChange(selected);
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    onError('');
    // Limpar o input é o que permite voltar a escolher o MESMO ficheiro: sem
    // isto o onChange não dispara, porque o valor não mudou.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative flex min-w-0 select-none flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-6 transition-colors ${
          disabled
            ? 'cursor-not-allowed border-muted-foreground/20 opacity-60'
            : 'cursor-pointer'
        } ${
          file
            ? 'border-primary/50 bg-primary/5'
            : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/30'
        }`}
      >
        {file ? (
          <div className="flex w-full min-w-0 items-center gap-3">
            <Paperclip className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="shrink-0 rounded-full p-1 transition-colors hover:bg-muted"
              aria-label="Remover ficheiro"
            >
              <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Clique para selecionar o ficheiro</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {hint ?? `JPEG, PNG, WebP ou PDF — máx. ${MAX_SIZE_MB} MB`}
            </p>
          </>
        )}
      </div>

      <input
        id={id}
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={handleChange}
      />

      {error && (
        <p className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
