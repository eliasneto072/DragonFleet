// src/app/components/driver/import-earnings.tsx
//
// CSV import card for drivers. Flow: pick file → optional platform →
// preview (server parses, shows totals/errors) → confirm import.
// This is the real "platform integration": upload the Uber/Bolt statement.

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  earningsImportService, type ImportPreview,
} from '@/features/driver/services/earnings-import.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import type { EarningPlatform } from '@/shared/types/api';

const PLATFORMS: { value: EarningPlatform | 'AUTO'; label: string }[] = [
  { value: 'AUTO', label: 'Detectar automaticamente' },
  { value: 'UBER', label: 'Uber' },
  { value: 'BOLT', label: 'Bolt' },
  { value: 'FREE_NOW', label: 'Free Now' },
  { value: 'OTHER', label: 'Outro' },
];

export function ImportEarnings() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<EarningPlatform | 'AUTO'>('AUTO');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const plat = platform === 'AUTO' ? undefined : platform;

  function reset() {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      toast.error('Envie um ficheiro .csv (exportado da Uber, Bolt, etc.)');
      return;
    }
    setFile(f);
    setPreview(null);
    setLoading(true);
    try {
      const result = await earningsImportService.preview(f, plat);
      setPreview(result);
      if (result.rowCount === 0) {
        toast.error('Nenhuma linha válida encontrada. Verifique o ficheiro.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao ler o ficheiro.');
      reset();
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setLoading(true);
    try {
      const { summary } = await earningsImportService.commit(file, plat);
      queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all });
      toast.success(
        `${summary.inserted} ganho(s) importado(s)` +
        (summary.skippedDuplicates ? ` · ${summary.skippedDuplicates} duplicado(s) ignorado(s)` : ''),
      );
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao importar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-accent" />
          Importar ganhos das plataformas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Descarregue o relatório de ganhos da Uber, Bolt ou Free Now e envie o ficheiro .csv aqui.
          O sistema lê os valores e registra automaticamente por plataforma.
        </p>

        {/* Platform select */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium shrink-0">Plataforma:</span>
          <Select value={platform} onValueChange={(v) => setPlatform(v as EarningPlatform | 'AUTO')}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dropzone */}
        {!file && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={[
              'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
              dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50',
            ].join(' ')}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste o ficheiro .csv ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">Máx. 5 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Processando ficheiro…</span>
          </div>
        )}

        {/* Preview */}
        {file && preview && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
                <span className="text-sm font-medium truncate">{file.name}</span>
              </div>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground" aria-label="Remover">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Linhas válidas</p>
                <p className="text-xl font-bold">{preview.rowCount}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Total a importar</p>
                <p className="text-xl font-bold text-success">{formatCurrency(preview.totalAmount)}</p>
              </div>
            </div>

            {/* Errors */}
            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                <div className="flex items-center gap-2 text-warning mb-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {preview.errors.length} linha(s) ignorada(s)
                  </span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                  {preview.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>Linha {e.line}: {e.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} disabled={loading}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={loading || preview.rowCount === 0}>
                {loading
                  ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Importando…</>)
                  : (<><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar importação</>)}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
