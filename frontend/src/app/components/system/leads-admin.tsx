// src/app/components/system/leads-admin.tsx
//
// Quem deixou o contacto no site.
//
// ─── A ORDEM É A DA URGÊNCIA COMERCIAL ──────────────────────────────────────
//
// Os novos primeiro e, dentro desses, os mais antigos à frente. Quem deixou o
// número há três dias e ainda não teve resposta é quem está mais perto de
// ligar a outra frota — e é a linha que tem de estar no topo.
//
// ─── E NÃO SE APAGA NENHUM ──────────────────────────────────────────────────
//
// Nem os perdidos. Daqui a um ano, saber que já se falou com aquele número e
// não avançou poupa uma segunda chamada igual — e evita a conversa de quem
// recebe a mesma proposta duas vezes.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Car, Inbox, Loader2, Mail, MessageCircle, Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import {
  systemService, type Contacto, type EstadoDoContacto,
} from '@/features/system/services/system.service';

const ESTADO: Record<EstadoDoContacto, { texto: string; cls: string }> = {
  NOVO: { texto: 'Novo', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  FALADO: { texto: 'Falado', cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300' },
  GANHO: { texto: 'Ganho', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  PERDIDO: { texto: 'Perdido', cls: 'bg-secondary text-muted-foreground' },
};

/** O número sem espaços, para o link do WhatsApp. */
function paraWhatsApp(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '');
  // Nove dígitos é um número português sem indicativo. Acrescentá-lo é o que
  // faz o link abrir a conversa em vez de dar erro.
  return digitos.length === 9 ? `351${digitos}` : digitos;
}

function Tratar({ contacto, onClose }: { contacto: Contacto; onClose: () => void }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoDoContacto>(
    contacto.estado === 'NOVO' ? 'FALADO' : contacto.estado,
  );
  const [notas, setNotas] = useState(contacto.notas ?? '');

  const m = useMutation({
    mutationFn: () => systemService.actualizarContacto(contacto.id, estado, notas.trim() || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success('Contacto actualizado.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível guardar.'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contacto.nome}</DialogTitle>
          <DialogDescription>
            {contacto.telefone}
            {contacto.email ? ` · ${contacto.email}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Em que pé está</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoDoContacto)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NOVO">Novo — ainda não falei</SelectItem>
                <SelectItem value="FALADO">Falado — a decorrer</SelectItem>
                <SelectItem value="GANHO">Ganho — entrou</SelectItem>
                <SelectItem value="PERDIDO">Perdido — não avançou</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="O que ficou combinado, ou porque não avançou."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadsAdmin() {
  const [todos, setTodos] = useState(false);
  const [aTratar, setATratar] = useState<Contacto | null>(null);

  const q = useQuery({
    queryKey: queryKeys.sistema.contactos(todos),
    queryFn: () => systemService.contactos(todos),
  });

  const contactos = q.data?.contactos ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contactos"
        subtitle="Quem deixou o número no site, por motorista ou por frota."
        icon={<Inbox className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="todos" className="text-sm text-muted-foreground">
              Ver fechados
            </Label>
            <Switch id="todos" checked={todos} onCheckedChange={setTodos} />
          </div>
        }
      />

      {q.isLoading && <Skeleton className="h-32 w-full" />}

      {!q.isLoading && contactos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-1">
            <p className="font-medium">
              {todos ? 'Ainda não entrou nenhum contacto.' : 'Nada por responder.'}
            </p>
            <p className="text-sm text-muted-foreground">
              Chegam aqui pelo formulário em dragonfleet.pt.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {contactos.map((c) => {
          const e = ESTADO[c.estado] ?? ESTADO.NOVO;
          const Icone = c.tipo === 'MOTORISTA' ? Car : Building2;

          return (
            <Card key={c.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold">{c.nome}</span>
                      <Badge variant="outline">
                        {c.tipo === 'MOTORISTA' ? 'Motorista' : 'Gestor de frota'}
                      </Badge>
                      <Badge className={e.cls} variant="secondary">{e.texto}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(c.criadoEm)}
                    </p>
                  </div>

                  <Button size="sm" onClick={() => setATratar(c)}>Tratar</Button>
                </div>

                {/* Os contactos são links: o passo seguinte a abrir esta lista
                    é ligar ou escrever, e não copiar um número à mão. */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`tel:${c.telefone.replace(/\s/g, '')}`}>
                      <Phone className="h-4 w-4 mr-1.5" />
                      {c.telefone}
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://wa.me/${paraWhatsApp(c.telefone)}`}
                      target="_blank" rel="noreferrer"
                    >
                      <MessageCircle className="h-4 w-4 mr-1.5" />
                      WhatsApp
                    </a>
                  </Button>
                  {c.email && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`mailto:${c.email}`}>
                        <Mail className="h-4 w-4 mr-1.5" />
                        {c.email}
                      </a>
                    </Button>
                  )}
                </div>

                {c.mensagem && (
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                    {c.mensagem}
                  </p>
                )}

                {c.notas && (
                  <p className="text-xs text-muted-foreground border-t pt-3">
                    <strong>Nota:</strong> {c.notas}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {aTratar && (
        <Tratar key={aTratar.id} contacto={aTratar} onClose={() => setATratar(null)} />
      )}
    </div>
  );
}
