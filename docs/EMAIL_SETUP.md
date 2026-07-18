# Configuração de Email (Resend)

## Porque as notificações não chegavam

O código de envio estava correto — documentos, saques e notificações já chamavam
o serviço de email. O problema era **infraestrutura**, não código:

1. **Remetente de teste.** Usava `onboarding@resend.dev`. A Resend só entrega
   emails desse endereço para **o email da sua própria conta Resend** (modo de
   teste). Para qualquer motorista, a Resend recusa em silêncio.

2. **Falha silenciosa.** Os erros só faziam `console.error` genérico e sumiam.

A versão nova torna o remetente configurável (`MAIL_FROM`) e regista cada envio
(sucesso com id, ou o erro real da Resend), para nada mais falhar em silêncio.

## Fazer o email funcionar de verdade

### 1. Verificar um domínio na Resend
- Painel da Resend → **Domains** → **Add Domain**
- Adicione os registos DNS indicados (SPF, DKIM) no seu provedor de domínio
- Aguarde a verificação

### 2. Configurar o `.env`
```env
RESEND_API_KEY="re_sua_chave"
MAIL_FROM="DragonFleet <no-reply@seudominio.com>"
FRONTEND_URL="https://seudominio.com"
```
O serviço lê `MAIL_FROM` e `FRONTEND_URL` do ambiente.

### 3. Confirmar nos logs
Ao criar uma notificação, o terminal do servidor mostra:
- `[email] Enviado "..." para ... (id: ...)` em caso de sucesso
- o erro real da Resend em caso de falha
- avisos na inicialização se a chave faltar ou se estiver em modo de teste

## Para testar AGORA (antes de verificar o domínio)

Mantenha `MAIL_FROM` como `onboarding@resend.dev` **e** use como destinatário o
**email da sua própria conta Resend** — esse caso a Resend entrega. Serve para
validar o fluxo ponta a ponta antes da apresentação.

> ⚠️ Segurança: se a `RESEND_API_KEY` do `.env` já esteve versionada, revogue-a
> no painel da Resend e gere uma nova. Nunca versionar o `.env`.

## Nota

Se a chave não estiver configurada, a app continua a funcionar — as notificações
aparecem no portal (sino), só não saem por email. O envio é best-effort e nunca
quebra a criação da notificação.
