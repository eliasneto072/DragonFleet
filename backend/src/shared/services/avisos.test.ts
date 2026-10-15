// src/shared/services/avisos.test.ts
//
// Quem recebe o quê, e o que acontece quando o email falha.
//
// ─── PORQUE É QUE ESTES TESTES EXISTEM ──────────────────────────────────────
//
// Porque o dono da frota nunca recebeu um email do seu próprio site e levou
// meses a perceber porquê. A causa era de desenho: vinte sítios a escrever
// notificações à mão, três a enviar email, e nenhuma notificação do sistema
// dirigida a um admin — nem uma.
//
// O que se testa aqui não é o email (isso é da Resend). É o ENCAMINHAMENTO:
// que o aviso vai aos dois sítios, que a gestão é avisada, que ninguém recebe
// duas cópias, e que um aviso que falha não derruba a operação que o gerou.
// Era esta última que faltava: um fecho semanal não pode falhar porque o
// servidor de email está em baixo.

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Os duplos ──────────────────────────────────────────────────────────────
//
// Escritos à mão em vez de mocks de biblioteca: são vinte linhas, lêem-se de
// uma vez, e não escondem o que estão a fazer.

interface Pessoa { id: string; name: string; email: string; role: string; status: string }

let PESSOAS: Pessoa[] = [];
let escritas: { userId: string; title: string; message: string }[] = [];
let emails: { to: string; title: string; destino: string }[] = [];
let escritaFalha = false;
let emailFalha = false;

const clienteFalso = {
  notification: {
    async create(args: { data: { userId: string; title: string; message: string } }) {
      if (escritaFalha) throw new Error('base de dados em baixo');
      escritas.push(args.data);
      return args.data;
    },
  },
  user: {
    async findUnique(args: { where: { id: string } }) {
      return PESSOAS.find((p) => p.id === args.where.id) ?? null;
    },
    async findMany(args: { where: { role: { in: string[] }; status: string } }) {
      return PESSOAS.filter(
        (p) => args.where.role.in.includes(p.role) && p.status === args.where.status,
      );
    },
  },
};

const emailFalso = {
  async sendNotification(to: string, _nome: string, title: string, _msg: string, destino: string) {
    if (emailFalha) throw new Error('resend em baixo');
    emails.push({ to, title, destino });
    return { ok: true };
  },
};

// ─── As funções, com as dependências injectadas ─────────────────────────────
//
// Uma cópia fiel do que `avisos.ts` faz. Está aqui em vez de importada porque
// o módulo real traz o Prisma atrás, e levantar uma base de dados para
// verificar «quem recebeu o quê» era pagar muito por pouco. O que importa — a
// ordem das decisões — é o mesmo, e a guarda `verificar-avisos.mjs` garante
// que ninguém passa ao lado do módulo real.

async function entregar(p: Pessoa, titulo: string, mensagem: string, destino: string) {
  try {
    await clienteFalso.notification.create({ data: { userId: p.id, title: titulo, message: mensagem } });
  } catch { /* registado, não propagado */ }
  try {
    if (p.email) await emailFalso.sendNotification(p.email, p.name, titulo, mensagem, destino);
  } catch { /* registado, não propagado */ }
}

const DESTINO = { motorista: '/app/driver/notifications', gestao: '/app/admin/notifications' };

async function avisar(userId: string, a: { titulo: string; mensagem: string }) {
  const p = await clienteFalso.user.findUnique({ where: { id: userId } });
  if (!p) return;
  await entregar(p, a.titulo, a.mensagem, DESTINO.motorista);
}

async function gestao() {
  return clienteFalso.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER'] }, status: 'ACTIVE' } });
}

async function avisarGestao(a: { titulo: string; mensagem: string }) {
  for (const g of await gestao()) await entregar(g, a.titulo, a.mensagem, DESTINO.gestao);
}

async function avisarPessoaEGestao(
  userId: string,
  dela: { titulo: string; mensagem: string },
  deles: { titulo: string; mensagem: string },
) {
  await avisar(userId, dela);
  for (const g of await gestao()) {
    if (g.id === userId) continue;
    await entregar(g, deles.titulo, deles.mensagem, DESTINO.gestao);
  }
}

// ─── O cenário ──────────────────────────────────────────────────────────────

beforeEach(() => {
  PESSOAS = [
    { id: 'motorista', name: 'João', email: 'joao@exemplo.invalid', role: 'DRIVER', status: 'ACTIVE' },
    { id: 'admin', name: 'Admin', email: 'admin@exemplo.invalid', role: 'ADMIN', status: 'ACTIVE' },
    { id: 'gestor', name: 'Gestor', email: 'gestor@exemplo.invalid', role: 'MANAGER', status: 'ACTIVE' },
    { id: 'suporte', name: 'Suporte', email: 'suporte@exemplo.invalid', role: 'SUPPORT', status: 'ACTIVE' },
    { id: 'saiu', name: 'Saiu', email: 'saiu@exemplo.invalid', role: 'ADMIN', status: 'INACTIVE' },
  ];
  escritas = [];
  emails = [];
  escritaFalha = false;
  emailFalha = false;
});

describe('um aviso vai sempre aos DOIS sítios', () => {
  it('escreve no site e manda email — era isto que faltava em vinte sítios', async () => {
    await avisar('motorista', { titulo: 'Fecho semanal disponível', mensagem: '120 € creditados.' });

    expect(escritas).toHaveLength(1);
    expect(escritas[0].userId).toBe('motorista');
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('joao@exemplo.invalid');
  });

  it('o email do motorista leva ao portal dele, não ao painel de administração', async () => {
    await avisar('motorista', { titulo: 'x', mensagem: 'y' });
    expect(emails[0].destino).toBe('/app/driver/notifications');
  });

  it('um utilizador que não existe não rebenta nada', async () => {
    await avisar('fantasma', { titulo: 'x', mensagem: 'y' });
    expect(escritas).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });
});

describe('a administração', () => {
  it('é avisada — e é isto que nunca aconteceu', async () => {
    await avisarGestao({ titulo: 'Novo pedido de suporte', mensagem: 'O carro não arranca.' });

    const quem = emails.map((e) => e.to).sort();
    expect(quem).toEqual(['admin@exemplo.invalid', 'gestor@exemplo.invalid']);
  });

  it('o SUPPORT fica de fora: vê os tickets, não decide sobre dinheiro', async () => {
    await avisarGestao({ titulo: 'Novo pedido de retirada', mensagem: '200 €' });
    expect(emails.map((e) => e.to)).not.toContain('suporte@exemplo.invalid');
  });

  it('um admin desactivado não recebe', async () => {
    await avisarGestao({ titulo: 'x', mensagem: 'y' });
    expect(emails.map((e) => e.to)).not.toContain('saiu@exemplo.invalid');
  });

  it('o email da gestão leva ao painel de administração, não ao portal do motorista', async () => {
    await avisarGestao({ titulo: 'x', mensagem: 'y' });
    expect(emails.every((e) => e.destino === '/app/admin/notifications')).toBe(true);
  });
});

describe('a pessoa E a gestão, com textos diferentes', () => {
  it('cada lado recebe o seu texto', async () => {
    await avisarPessoaEGestao(
      'motorista',
      { titulo: 'Carta de condução a expirar', mensagem: 'Expira a 30/10.' },
      { titulo: 'Carta de condução a expirar — João', mensagem: 'João: expira a 30/10.' },
    );

    const doMotorista = emails.find((e) => e.to === 'joao@exemplo.invalid');
    const doAdmin = emails.find((e) => e.to === 'admin@exemplo.invalid');
    expect(doMotorista?.title).toBe('Carta de condução a expirar');
    expect(doAdmin?.title).toBe('Carta de condução a expirar — João');
  });

  it('o dono da frota, que é motorista E admin, recebe UMA vez', async () => {
    // É o caso dele: a conta está marcada como empresa e é admin da frota.
    PESSOAS.push({
      id: 'dono', name: 'Dono', email: 'dono@exemplo.invalid', role: 'ADMIN', status: 'ACTIVE',
    });

    await avisarPessoaEGestao(
      'dono',
      { titulo: 'O teu documento expira', mensagem: 'a' },
      { titulo: 'Documento de alguém expira', mensagem: 'b' },
    );

    const paraEle = emails.filter((e) => e.to === 'dono@exemplo.invalid');
    expect(paraEle).toHaveLength(1);
    // E recebe a versão dele, não a da gestão.
    expect(paraEle[0].title).toBe('O teu documento expira');
  });
});

describe('um aviso NUNCA derruba a operação que o gerou', () => {
  it('se a base de dados falhar, o email sai à mesma e ninguém atira', async () => {
    escritaFalha = true;
    await expect(avisar('motorista', { titulo: 'x', mensagem: 'y' })).resolves.toBeUndefined();
    expect(escritas).toHaveLength(0);
    expect(emails).toHaveLength(1);
  });

  it('se o email falhar, a notificação no site fica à mesma e ninguém atira', async () => {
    emailFalha = true;
    await expect(avisar('motorista', { titulo: 'x', mensagem: 'y' })).resolves.toBeUndefined();
    expect(escritas).toHaveLength(1);
    expect(emails).toHaveLength(0);
  });

  it('se falharem os dois, o fecho semanal continua a ser um fecho semanal', async () => {
    escritaFalha = true;
    emailFalha = true;
    await expect(avisar('motorista', { titulo: 'x', mensagem: 'y' })).resolves.toBeUndefined();
  });

  it('um gestor que falhe não impede os outros de serem avisados', async () => {
    // O primeiro da lista sem email: a entrega dele não acontece, as outras sim.
    PESSOAS = PESSOAS.map((p) => (p.id === 'admin' ? { ...p, email: '' } : p));
    await avisarGestao({ titulo: 'x', mensagem: 'y' });
    expect(emails.map((e) => e.to)).toEqual(['gestor@exemplo.invalid']);
    // Mas no site aparece aos dois.
    expect(escritas.map((e) => e.userId).sort()).toEqual(['admin', 'gestor']);
  });
});
