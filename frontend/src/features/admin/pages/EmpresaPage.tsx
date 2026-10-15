import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Briefcase, Upload } from 'lucide-react';
import { EmpresaContas } from '@/app/components/admin/empresa-contas';
import { ImportarExtratos } from '@/app/components/shared/importar-extratos';

export function EmpresaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresa</h1>
        <p className="text-muted-foreground">
          O lucro, o que está em caixa e as despesas
        </p>
      </div>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas" className="gap-1.5">
            <Briefcase className="h-4 w-4" />
            Contas
          </TabsTrigger>
          {/* A importação num separador e não na mesma página: a revisão de um
              extrato são dezenas de linhas, e por baixo dos números do lucro
              empurrava para fora do ecrã aquilo a que se vem. */}
          <TabsTrigger value="importar" className="gap-1.5">
            <Upload className="h-4 w-4" />
            Importar extratos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="mt-6">
          <EmpresaContas />
        </TabsContent>
        <TabsContent value="importar" className="mt-6">
          <ImportarExtratos ambito="EMPRESA" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
