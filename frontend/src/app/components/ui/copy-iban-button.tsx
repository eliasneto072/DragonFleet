// src/app/components/ui/copy-iban-button.tsx
//
// Copiar um IBAN para a área de transferência.
//
// POR QUE EXISTE: o IBAN é o único campo destas telas que vai ser reescrito
// noutro sítio — o homebanking — e transcrever 25 caracteres à mão é onde
// nascem os enganos que a validação do resto 97 existe para apanhar. O botão
// remove o passo.
//
// Vive em ui/ e não dentro de uma das telas porque é usado por duas: a fila de
// aprovação e o histórico de retiradas. Alojá-lo numa delas obrigaria a outra a
// importar de uma tela irmã, que é a dívida já anotada no withdrawalsService.

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { CheckCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

/**
 * navigator.clipboard não existe em contexto inseguro (http://) nem em
 * browsers antigos. Sem o recurso ao textarea, o clique não faria nada e
 * ninguém saberia porquê.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyIbanButton({ iban, label = 'Copiar IBAN' }: {
  iban: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // Sem espaços: é a forma que o homebanking aceita colada.
    const ok = await copyToClipboard(iban.replace(/\s+/g, ''));
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione e copie à mão.');
      return;
    }
    setCopied(true);
    toast.success('IBAN copiado.');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={handleCopy}>
      {copied
        ? <CheckCircle className="mr-1.5 h-3.5 w-3.5 text-success" aria-hidden="true" />
        : <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </Button>
  );
}
