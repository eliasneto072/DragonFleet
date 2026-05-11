// src/app/components/driver/support.tsx

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { MessageCircle, Send, Phone, Mail, Clock } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'technical',  label: 'Técnico'     },
  { value: 'financial',  label: 'Financeiro'  },
  { value: 'documents',  label: 'Documentos'  },
  { value: 'account',    label: 'Conta'       },
  { value: 'other',      label: 'Outro'       },
];

const EMPTY_FORM = { subject: '', category: '', message: '' };

export default function Support() {
  const [form, setForm]         = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Quando o módulo de suporte for implementado no backend,
  // substitua esse handler por uma useMutation do TanStack Query
  // chamando o supportService.createTicket(form)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    // Simula o tempo de envio enquanto o backend não existe
    await new Promise((r) => setTimeout(r, 800));

    toast.success('Pedido enviado! Nossa equipe entrará em contato em breve.');
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  return (
    <div className="space-y-6">

      {/* Canais de contato */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Phone, title: 'Telefone',  info: '+55 11 3000-0000',        sub: 'Seg–Sex: 9h–18h'    },
          { icon: Mail,  title: 'E-mail',    info: 'suporte@dragonfleet.com', sub: 'Resposta em até 24h' },
          { icon: Clock, title: 'Horário',   info: 'Segunda a Sexta',         sub: '09:00 – 18:00'       },
        ].map(({ icon: Icon, title, info, sub }) => (
          <Card key={title} className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center text-white">
                <Icon className="h-8 w-8 mb-3" />
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-gray-200">{info}</p>
                <p className="text-xs text-gray-300 mt-2">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Formulário de novo pedido */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Novo Pedido de Suporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="subject">Assunto</Label>
              <Input
                id="subject"
                placeholder="Descreva brevemente o problema"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="message">Mensagem</Label>
              <Textarea
                id="message"
                placeholder="Descreva detalhadamente o problema ou dúvida"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="min-h-[150px]"
                required
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full md:w-auto">
              <Send className="h-4 w-4 mr-2" />
              {submitting ? 'Enviando…' : 'Enviar Pedido'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Histórico — vazio até o backend de suporte ser implementado */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
            <MessageCircle className="h-12 w-12 opacity-30" />
            <p className="text-sm text-center">
              O histórico de pedidos estará disponível em breve.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Perguntas Frequentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                q: 'Como solicitar uma retirada?',
                a: 'Vá até a aba "Retiradas", insira o valor desejado e clique em "Solicitar Retirada". O pedido será analisado em até 24h.',
              },
              {
                q: 'Como fazer upload de documentos?',
                a: 'Na aba "Documentos", clique em "Enviar Documento", selecione o tipo e informe a URL do arquivo. Documentos são revisados em até 48h.',
              },
              {
                q: 'Quanto tempo demora o processamento de saques?',
                a: `Saques aprovados são processados em até 3 dias úteis.`,
              },
            ].map(({ q, a }) => (
              <details key={q} className="group border-b last:border-0 pb-3 last:pb-0">
                <summary className="flex cursor-pointer items-center justify-between py-2 font-semibold list-none">
                  {q}
                  <svg className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="pt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}