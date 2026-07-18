// src/app/components/admin/export-report.tsx
//
// Admin-only financial PDF export. Drop this into the Analytics or Financial
// page. Renders a date-range picker + download button.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { reportsService } from '@/features/admin/services/reports.service';

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 5, 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function ExportReport() {
  const init = defaultRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    if (new Date(from) > new Date(to)) {
      toast.error('A data inicial não pode ser maior que a final.');
      return;
    }
    setLoading(true);
    try {
      await reportsService.downloadFinancialPdf({ from, to });
      toast.success('Relatório gerado com sucesso!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar o relatório.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="h-5 w-5 text-accent" />
          Relatório financeiro (PDF)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Gera um PDF com receita da empresa, ganhos por plataforma, retiradas e top motoristas
          no período selecionado.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-from">De</Label>
            <Input id="report-from" type="date" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-to">Até</Label>
            <Input id="report-to" type="date" value={to} min={from}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <Button onClick={handleDownload} disabled={loading}>
            {loading
              ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando…</>)
              : (<><FileDown className="h-4 w-4 mr-2" />Baixar PDF</>)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
