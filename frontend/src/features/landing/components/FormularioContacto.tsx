// src/features/landing/components/FormularioContacto.tsx
//
// Dois campos obrigatórios e mais nada.
//
// ─── PORQUE É QUE PEDE TÃO POUCO ────────────────────────────────────────────
//
// Nome e telefone. Cada campo a mais é uma razão a mais para alguém fechar a
// página a meio, e tudo o resto descobre-se na chamada — que é onde se vende,
// e não aqui. O email e a mensagem ficam, opcionais, para quem preferir
// escrever a falar.
//
// ─── O CAMPO QUE NÃO SE VÊ ──────────────────────────────────────────────────
//
// Há um campo `website` escondido. Nenhuma pessoa o preenche porque nenhuma
// pessoa o vê; os robôs preenchem tudo o que encontram num formulário. Vindo
// preenchido, o servidor responde que sim e não grava nada — ver
// `leads.service.ts` do lado do servidor.
//
// Está escondido com posicionamento e não com `display:none` nem `hidden`:
// os robôs mais cuidadosos saltam os campos escondidos dessas duas formas,
// porque são as duas óbvias.

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  leadsService, type TipoDeContacto,
} from '@/features/landing/services/leads.service';
import { VERDE, VERDE_ESCURO } from './Chrome';

export function FormularioContacto({
  tipo, titulo, subtitulo,
}: { tipo: TipoDeContacto; titulo: string; subtitulo: string }) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [website, setWebsite] = useState(''); // a armadilha

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await leadsService.registar({
        tipo,
        nome,
        telefone,
        email: email.trim() || null,
        mensagem: mensagem.trim() || null,
        website,
      });
      setEnviado(true);
    } catch (err: any) {
      setErro(err?.message ?? 'Não foi possível enviar. Tente pelo WhatsApp.');
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: VERDE }} />
        <h3 className="mt-4 text-xl font-semibold text-white">Recebido.</h3>
        <p className="mt-2 text-white/60">
          Entramos em contacto consigo. Se for urgente, ligue ou mande mensagem
          pelo WhatsApp.
        </p>
      </div>
    );
  }

  const campo = 'w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 '
    + 'text-white placeholder:text-white/30 outline-none transition '
    + 'focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/30';

  return (
    <form
      onSubmit={enviar}
      className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8"
    >
      <h3 className="text-xl font-semibold text-white">{titulo}</h3>
      <p className="mt-1 text-sm text-white/60">{subtitulo}</p>

      <div className="mt-6 space-y-3">
        <input
          required minLength={2} maxLength={80}
          value={nome} onChange={(e) => setNome(e.target.value)}
          className={campo} placeholder="O seu nome" autoComplete="name"
        />
        <input
          required type="tel" minLength={6} maxLength={25}
          value={telefone} onChange={(e) => setTelefone(e.target.value)}
          className={campo} placeholder="Telemóvel" autoComplete="tel"
        />
        <input
          type="email" maxLength={120}
          value={email} onChange={(e) => setEmail(e.target.value)}
          className={campo} placeholder="Email (opcional)" autoComplete="email"
        />
        <textarea
          rows={3} maxLength={1000}
          value={mensagem} onChange={(e) => setMensagem(e.target.value)}
          className={campo} placeholder="Quer dizer-nos alguma coisa? (opcional)"
        />

        {/* A armadilha. Ver a nota no topo: escondida fora do ecrã, e não com
            display:none, que é o que os robôs cuidadosos sabem saltar. */}
        <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
          <label htmlFor={`website-${tipo}`}>Não preencher</label>
          <input
            id={`website-${tipo}`} name="website" type="text" tabIndex={-1}
            autoComplete="off"
            value={website} onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      {erro && (
        <p role="alert" className="mt-4 rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-300">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5
          text-base font-semibold text-white shadow-lg transition
          hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${VERDE} 0%, ${VERDE_ESCURO} 100%)` }}
      >
        {enviando
          ? <><Loader2 className="h-4 w-4 animate-spin" />A enviar…</>
          : <><Send className="h-4 w-4" />Quero saber mais</>}
      </button>

      <p className="mt-3 text-center text-xs text-white/40">
        Usamos o seu contacto só para lhe responder.
      </p>
    </form>
  );
}
