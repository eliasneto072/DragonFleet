// backend/src/scripts/seed-frota-exemplo.ts
//
// Cria uma FROTA DE EXEMPLO, cheia e inteiramente inventada.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PARA QUE SERVE                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Para se poderem tirar as capturas de ecrã do site sem fotografar um único
// dado de uma pessoa real.
//
// A alternativa era fotografar a frota verdadeira e apagar os nomes nas
// imagens. Numa captura do painel há mais dados pessoais do que parece —
// nomes, matrículas, IBAN, valores, emails, iniciais nos avatares, uma linha
// meio tapada no fim de uma tabela — e basta escapar um para ficar publicado
// num site, indexado e sem volta a dar. Aqui não há nada para escapar: não há
// nada de verdadeiro lá dentro.
//
// Serve também de base à conta de demonstração aberta ao público. Essa tem
// uma decisão de segurança por tomar antes — ver o fim deste ficheiro.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  COMO SE CORRE                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
//   DEMO_PASSWORD='uma-password-tua' node dist/scripts/seed-frota-exemplo.js
//
// Em `src/` e não em `prisma/` pela mesma razão que o `seed-admin`: o
// tsconfig compila `src/**` para `dist/`, a imagem de produção leva o `dist/`
// e o `tsx` é uma devDependency que lá não está. Daqui, corre com o Node que
// já existe no contentor do Render.
//
// Variáveis:
//   DEMO_PASSWORD   obrigatória, mínimo 8. A password do gestor de exemplo.
//                   Nunca é impressa.
//   DEMO_EMAIL      opcional. Por omissão `gestor@frota-exemplo.invalid`.
//   DEMO_NOME       opcional. Por omissão `Frota Exemplo`.
//
// Correr duas vezes não faz mal: à segunda pára e não escreve nada.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PORQUE É QUE ISTO NÃO TOCA NA FROTA REAL                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Porque a frota nasce nova e tudo o resto é escrito dentro de `comFrota()`,
// que é o que carimba a frota em cada linha. A separação entre frotas — a
// mesma que decidimos NÃO gabar na página de vendas, por ser o mínimo — é o
// que torna este script seguro de correr em produção.
//
// E a frota é criada pelo `systemService.criarFrota`, o mesmo método que o
// teu painel de dono usa para criar a frota de um cliente. Não há aqui uma
// segunda forma de nascer uma frota a divergir daquela — e a frota de exemplo
// fica exactamente igual à de um cliente a sério, que é o que se quer
// fotografar.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { comFrota, comoDono } from '../config/escopo';
import { systemService } from '../modules/system/system.service';
import { computeTotals } from '../modules/settlements/settlements.types';

const prisma = new PrismaClient();

// ─── AS PESSOAS E AS COISAS INVENTADAS ──────────────────────────────────────
//
// Os emails usam o domínio `.invalid`, que é reservado por norma (RFC 2606) e
// nunca vai existir. Se um dia esta frota ficar aberta ao público e alguma
// coisa tentar enviar um email para aqui, não há ninguém do outro lado —
// enquanto um domínio inventado à mão pode pertencer a alguém.
const DOMINIO = 'frota-exemplo.invalid';

// As matrículas são `ZZ-nn-ZZ`: tem o formato português, mas na ponta da
// série e com dígitos baixos, por isso não é de ninguém. Numa captura lê-se
// logo como exemplo, que é o que queremos.
const MOTORISTAS = [
  { nome: 'Hugo Barata',    matricula: 'ZZ-01-ZZ', carro: { marca: 'Renault', modelo: 'Mégane', ano: 2021, energia: 'FUEL',     aluguer: 220 } },
  { nome: 'Cláudia Rosa',   matricula: 'ZZ-02-ZZ', carro: { marca: 'Toyota',  modelo: 'Corolla', ano: 2022, energia: 'HYBRID',  aluguer: 240 } },
  { nome: 'Nuno Ferraz',    matricula: 'ZZ-03-ZZ', carro: { marca: 'Peugeot', modelo: '308',     ano: 2020, energia: 'FUEL',    aluguer: 200 } },
  { nome: 'Marta Quental',  matricula: 'ZZ-04-ZZ', carro: { marca: 'Tesla',   modelo: 'Model 3', ano: 2023, energia: 'ELECTRIC', aluguer: 275 } },
  { nome: 'Ivo Menezes',    matricula: 'ZZ-05-ZZ', carro: { marca: 'Dacia',   modelo: 'Jogger',  ano: 2022, energia: 'FUEL',    aluguer: 195 } },
  // O sexto conduz carro próprio: sem aluguer, mas com a comissão e o slot.
  // Existe para a frota de exemplo mostrar os DOIS modelos de negócio, que é
  // o que a página de vendas diz que existem.
  { nome: 'Sérgio Pinhal',  matricula: null,       carro: null },
] as const;

/** As duas sociedades por onde passam os recibos verdes. */
const SOCIEDADES = ['Mobilidade Atlântico Lda', 'Via Central Unipessoal Lda'];

const OFICINAS = [
  { nome: 'Auto Ribeira',        tipo: 'OFICINA',  morada: 'Rua das Oliveiras 14, Loures' },
  { nome: 'Centro de Inspeções Norte', tipo: 'INSPECAO', morada: 'Av. Central 220, Odivelas' },
];

const MATERIAIS = [
  { nome: 'Pastilhas de travão (frente)', unidade: 'jogo', categoria: 'Travagem',   minimo: 2, custo: 38.5 },
  { nome: 'Óleo motor 5W30',              unidade: 'L',    categoria: 'Lubrificantes', minimo: 10, custo: 7.2 },
  { nome: 'Filtro de óleo',               unidade: 'un',   categoria: 'Filtros',     minimo: 4, custo: 9.9 },
  { nome: 'Filtro de habitáculo',         unidade: 'un',   categoria: 'Filtros',     minimo: 4, custo: 12.4 },
  { nome: 'Lâmpada H7',                   unidade: 'un',   categoria: 'Iluminação',  minimo: 6, custo: 4.8 },
  { nome: 'Pneu 205/55 R16',              unidade: 'un',   categoria: 'Pneus',       minimo: 4, custo: 68.0 },
];

// ─── NÚMEROS REPETÍVEIS ─────────────────────────────────────────────────────
//
// Um gerador simples e com semente fixa, em vez de `Math.random()`: correr o
// script outra vez dá exactamente os mesmos valores. Se tiveres de repetir
// uma captura daqui a um mês, o ecrã está igual ao da primeira — e não com
// números diferentes a dar nas vistas ao lado das outras imagens.
// O multiplicador é pequeno (MINSTD) por uma razão prática: com um
// multiplicador grande, `semente * mult` passa dos 2^53 que um número de
// JavaScript guarda sem perder dígitos, e a partir daí a sequência deixa de
// ser a mesma de uma máquina para outra. Aqui o maior produto possível fica
// bem abaixo disso.
let semente = 20261014;
function aleatorio(): number {
  semente = (semente * 48271) % 2147483647;
  return semente / 2147483647;
}
function entre(min: number, max: number, casas = 2): number {
  const v = min + aleatorio() * (max - min);
  return Number(v.toFixed(casas));
}

// ─── DATAS ──────────────────────────────────────────────────────────────────

function soData(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function maisDias(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return soData(d);
}

/** A segunda-feira de há `semanasAtras` semanas. */
function segunda(semanasAtras: number): Date {
  const hoje = soData(new Date());
  // getUTCDay(): 0 é domingo. Recuar até à segunda desta semana.
  const recuo = (hoje.getUTCDay() + 6) % 7;
  return maisDias(hoje, -recuo - semanasAtras * 7);
}

// ─── O SCRIPT ───────────────────────────────────────────────────────────────

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v || !v.trim()) {
    console.error(
      `\n[frota-exemplo] Falta a variável ${nome}.\n\n`
      + `  DEMO_PASSWORD='a-tua-password' node dist/scripts/seed-frota-exemplo.js\n`,
    );
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  const password = exigir('DEMO_PASSWORD');
  if (password.length < 8) {
    console.error('[frota-exemplo] DEMO_PASSWORD tem de ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  const nomeDaFrota = process.env.DEMO_NOME?.trim() || 'Frota Exemplo';
  const emailGestor = (process.env.DEMO_EMAIL?.trim() || `gestor@${DOMINIO}`).toLowerCase();

  // ─── Já existe? Então não se escreve nada ────────────────────────────────
  //
  // Correr duas vezes por engano é fácil (uma ligação que cai a meio, um
  // comando repetido na consola do Render). Em vez de criar uma segunda frota
  // de exemplo com o mesmo nome e um slug diferente, pára aqui.
  const existente = await comoDono(async () => prisma.fleet.findFirst({
    where: { name: nomeDaFrota },
    select: { id: true, slug: true },
  }));
  if (existente) {
    console.log(
      `[frota-exemplo] Já existe uma frota chamada "${nomeDaFrota}" (${existente.slug}).`
      + `\n  Não foi escrito nada. Para criar outra, corre com DEMO_NOME='Outro nome'.`,
    );
    return;
  }

  // ─── A frota ─────────────────────────────────────────────────────────────
  //
  // Sem plano, de propósito: sem plano o sistema abre tudo (ver
  // `capacidade.ts`), e as capturas têm de poder mostrar qualquer menu. Um ano
  // de assinatura para não aparecer o aviso de expirada por cima das imagens.
  const { frota } = await comoDono(async () => systemService.criarFrota({
    nome: nomeDaFrota,
    notas: 'Frota de demonstração. Todos os dados são inventados.',
    dias: 365,
    gestor: { nome: 'Rui Marques', email: emailGestor, password },
  }));

  console.log(`[frota-exemplo] Frota criada: ${frota.name} (${frota.slug})`);

  // ─── DAQUI PARA BAIXO, TUDO DENTRO DA FROTA NOVA ─────────────────────────
  //
  // `comFrota` é o que carimba a frota em cada escrita. Fora dele, estas
  // linhas nasciam com a frota vazia e a chave estrangeira recusava-as — que
  // é exactamente o que se quer que aconteça, em vez de irem parar à frota
  // errada em silêncio.
  await comFrota(frota.id, async () => {
    // O `id` e a cifra da password do gestor. A cifra é lida uma vez e
    // reutilizada nos motoristas: é a mesma password para todos, o que numa
    // frota de mentira poupa seis passwords a quem tiver de entrar numa conta
    // de motorista para fotografar o lado dele. A password em claro nunca é
    // guardada nem impressa em lado nenhum.
    const gestor = await prisma.user.findFirst({
      where: { email: emailGestor }, select: { id: true, password: true },
    });
    if (!gestor) throw new Error('[frota-exemplo] o gestor não foi encontrado na frota nova');

    // ── Sociedades ──
    const sociedades = [];
    for (const [i, nome] of SOCIEDADES.entries()) {
      sociedades.push(await prisma.company.create({
        data: { name: nome, sortOrder: i, active: true },
      }));
    }

    // ── Oficinas ──
    const oficinas = [];
    for (const o of OFICINAS) {
      oficinas.push(await prisma.workshop.create({
        data: { name: o.nome, kind: o.tipo, address: o.morada, phone: '210 000 000', active: true },
      }));
    }

    // Os tipos de serviço já foram criados pelo `criarFrota`, iguais aos de
    // qualquer cliente. Vai-se buscar um para as marcações.
    const servicos = await prisma.serviceType.findMany({ orderBy: { label: 'asc' } });

    // ── Motoristas, carros e atribuições ──
    const motoristas: { id: string; nome: string; veiculoId: string | null; aluguer: number }[] = [];

    for (const m of MOTORISTAS) {
      const email = `${m.nome.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '.')}@${DOMINIO}`;

      const u = await prisma.user.create({
        data: {
          name: m.nome,
          email,
          password: gestor.password,
          role: 'DRIVER',
          status: 'ACTIVE',
          phone: '+351910000000',
        },
        select: { id: true },
      });

      let veiculoId: string | null = null;
      if (m.carro && m.matricula) {
        const v = await prisma.vehicle.create({
          data: {
            brand: m.carro.marca,
            model: m.carro.modelo,
            plate: m.matricula,
            year: m.carro.ano,
            status: 'ACTIVE',
            energyType: m.carro.energia,
            weeklyFee: m.carro.aluguer,
            userId: u.id,
            nextInspectionOn: maisDias(new Date(), 40 + Math.round(aleatorio() * 300)),
          },
          select: { id: true },
        });
        veiculoId = v.id;

        // Escrita separada e não aninhada dentro do `vehicle.create`: a
        // camada do âmbito só carimba o `data` de primeiro nível, e uma
        // criação aninhada nascia com a frota vazia. Já partiu a criação de
        // um plano de investimento neste projeto exactamente assim.
        await prisma.vehicleAssignment.create({
          data: { vehicleId: v.id, userId: u.id, startedAt: segunda(10) },
        });
      }

      // ── Conta bancária ──
      //
      // O IBAN é todo a zeros: não passa a validação de um banco e não é de
      // ninguém. Numa captura lê-se como exemplo.
      await prisma.bankAccount.create({
        data: {
          userId: u.id,
          label: 'Conta principal',
          isPrimary: true,
          iban: 'PT50000000000000000000000',
          holderName: m.nome,
        },
      });

      motoristas.push({
        id: u.id, nome: m.nome, veiculoId,
        aluguer: m.carro?.aluguer ?? 0,
      });
    }

    console.log(`[frota-exemplo]   ${motoristas.length} motoristas, ${motoristas.filter((m) => m.veiculoId).length} carros`);

    // ── Documentos ──
    //
    // As datas são escolhidas para a captura dos documentos ter alguma coisa
    // para mostrar: um já expirado, dois a expirar dentro de dias, e o resto
    // longe. Um ecrã todo verde não ilustra a funcionalidade que o vende.
    const hoje = soData(new Date());
    const prazos = [-4, 9, 23, 120, 210, 300];

    for (const [i, m] of motoristas.entries()) {
      await prisma.document.create({
        data: {
          userId: m.id, type: 'CARTA_CONDUCAO', status: 'APPROVED',
          fileUrl: 'exemplo/sem-ficheiro', fileKey: 'exemplo/sem-ficheiro',
          issuedAt: maisDias(hoje, -900), expiresAt: maisDias(hoje, prazos[i % prazos.length]),
        },
      });
      await prisma.document.create({
        data: {
          userId: m.id, type: 'CERTIFICADO_TVDE', status: 'APPROVED',
          fileUrl: 'exemplo/sem-ficheiro', fileKey: 'exemplo/sem-ficheiro',
          issuedAt: maisDias(hoje, -500), expiresAt: maisDias(hoje, prazos[(i + 2) % prazos.length] + 30),
        },
      });

      if (m.veiculoId) {
        await prisma.document.create({
          data: {
            userId: m.id, vehicleId: m.veiculoId, type: 'SEGURO_CARTA_VERDE', status: 'APPROVED',
            fileUrl: 'exemplo/sem-ficheiro', fileKey: 'exemplo/sem-ficheiro',
            issuedAt: maisDias(hoje, -300), expiresAt: maisDias(hoje, prazos[(i + 1) % prazos.length] + 5),
          },
        });
      }
    }

    // ── Fechos semanais ──
    //
    // Os totais são calculados pelo `computeTotals`, a MESMA função que o
    // sistema usa quando fechas uma semana a sério. Escrever os valores à mão
    // dava uma captura com contas que não batem certo — e é precisamente a
    // conta que o comprador vai conferir com o dedo no ecrã.
    const SEMANAS = 8;
    let fechos = 0;

    for (let s = SEMANAS; s >= 1; s -= 1) {
      const inicio = segunda(s);
      const fim = maisDias(inicio, 6);

      for (const m of motoristas) {
        const temCarroDaFrota = m.veiculoId !== null;

        const uber = entre(300, 620);
        const bolt = entre(150, 400);
        const portagens = entre(12, 45);
        // Elétrico carrega, os outros metem combustível. As duas colunas são
        // separadas no sistema, e um híbrido pode ter as duas.
        const eletrico = m.nome === 'Marta Quental';
        const combustivel = eletrico ? 0 : entre(65, 130);
        const carga = eletrico ? entre(22, 48) : 0;

        // As condições da página de vendas, aplicadas: carro da frota paga
        // aluguer e não paga comissão; carro próprio paga 6% e os 50 € do
        // slot semanal.
        const aluguer = temCarroDaFrota ? m.aluguer : 0;
        const comissao = temCarroDaFrota ? 0 : 6;
        const outras = temCarroDaFrota ? 0 : 50;

        const valores = {
          uberAmount: uber,
          boltAmount: bolt,
          otherRevenue: 0,
          tollsAmount: portagens,
          fuelAmount: combustivel,
          chargeAmount: carga,
          vehicleFee: aluguer,
          otherDeductions: outras,
        };
        const t = computeTotals({ ...valores, commissionRate: comissao, taxRate: 6 });

        await prisma.weeklySettlement.create({
          data: {
            userId: m.id,
            vehicleId: m.veiculoId,
            weekStart: inicio,
            weekEnd: fim,
            ...valores,
            commissionRate: comissao,
            taxRate: 6,
            taxBase: t.taxBase,
            taxAmount: t.taxAmount,
            grossRevenue: t.grossRevenue,
            totalDeductions: t.totalDeductions,
            profitBase: t.profitBase,
            commissionAmount: t.commissionAmount,
            netToDriver: t.netToDriver,
            // A semana mais recente fica por registar: assim a captura do
            // fecho mostra o ecrã a meio do trabalho, que é como ele se vê
            // na vida real, e não só um histórico todo fechado.
            status: s === 1 ? 'DRAFT' : 'REGISTERED',
            registeredAt: s === 1 ? null : maisDias(fim, 2),
            createdById: gestor.id,
            odometerStart: 100000 + (SEMANAS - s) * 900,
            odometerEnd: 100000 + (SEMANAS - s) * 900 + Math.round(entre(600, 1100, 0)),
          },
        });
        fechos += 1;
      }
    }
    console.log(`[frota-exemplo]   ${fechos} fechos semanais em ${SEMANAS} semanas`);

    // ── Pedidos de retirada ──
    //
    // Espalhados pelo ano e repartidos pelas duas sociedades, mais alguns por
    // classificar. É isto que enche a tabela cruzada dos recibos verdes: sem
    // retiradas pagas em meses diferentes, aquela captura ficava vazia.
    let retiradas = 0;
    for (const [i, m] of motoristas.entries()) {
      for (let k = 0; k < 4; k += 1) {
        const diasAtras = 20 + k * 55 + i * 3;
        const pago = k > 0;
        // Um de cada três fica por classificar, para a tabela mostrar também
        // essa coluna — que existe precisamente porque isto acontece.
        const semSociedade = (i + k) % 3 === 0;

        await prisma.withdrawal.create({
          data: {
            userId: m.id,
            amount: entre(250, 900),
            status: pago ? 'PAID' : 'PENDING',
            requestedAt: maisDias(hoje, -diasAtras),
            processedAt: pago ? maisDias(hoje, -diasAtras + 2) : null,
            receiptUrl: 'exemplo/sem-ficheiro',
            receiptKey: 'exemplo/sem-ficheiro',
            paidToIban: pago ? 'PT50000000000000000000000' : null,
            paidToHolder: pago ? m.nome : null,
            companyId: pago && !semSociedade ? sociedades[(i + k) % sociedades.length].id : null,
            companySetById: pago && !semSociedade ? gestor.id : null,
            companySetAt: pago && !semSociedade ? maisDias(hoje, -diasAtras + 2) : null,
          },
        });
        retiradas += 1;
      }
    }
    console.log(`[frota-exemplo]   ${retiradas} pedidos de retirada`);

    // ── Oficina ──
    const comCarro = motoristas.filter((m) => m.veiculoId);
    const estados = ['PENDENTE', 'CONFIRMADA', 'CONCLUIDA', 'PENDENTE'] as const;

    for (const [i, m] of comCarro.slice(0, 4).entries()) {
      const estado = estados[i];
      const concluida = estado === 'CONCLUIDA';
      await prisma.booking.create({
        data: {
          vehicleId: m.veiculoId!,
          driverId: m.id,
          workshopId: oficinas[i % oficinas.length].id,
          serviceTypeId: servicos[i % servicos.length].id,
          description: [
            'Revisão das 20.000 km',
            'Barulho na travagem à frente',
            'Mudança de óleo e filtros',
            'Inspeção periódica',
          ][i],
          scheduledAt: maisDias(hoje, concluida ? -9 : 3 + i * 2),
          status: estado,
          logistics: 'MOTORISTA_LEVA',
          cost: concluida ? entre(90, 260) : null,
          completedAt: concluida ? maisDias(hoje, -9) : null,
          completionNotes: concluida ? 'Substituídas as pastilhas da frente. Travões conferidos.' : null,
          createdById: gestor.id,
        },
      });
    }

    // ── Peças ──
    //
    // Dois materiais ficam abaixo do mínimo de propósito: a captura do stock
    // tem de mostrar o aviso, que é a parte que interessa a quem compra.
    let movimentos = 0;
    for (const [i, mat] of MATERIAIS.entries()) {
      const abaixo = i === 0 || i === 5;
      const entrada = abaixo ? mat.minimo - 1 : mat.minimo * 3;

      const material = await prisma.material.create({
        data: {
          name: mat.nome, unit: mat.unidade, category: mat.categoria,
          minQty: mat.minimo, qty: entrada, avgCost: mat.custo, active: true,
        },
        select: { id: true },
      });

      await prisma.stockMove.create({
        data: {
          materialId: material.id, kind: 'ENTRADA',
          qty: entrada + 2, unitCost: mat.custo, totalCost: Number(((entrada + 2) * mat.custo).toFixed(2)),
          supplier: 'Peças Linha Verde', invoiceRef: `FT 2026/${100 + i}`,
          occurredAt: maisDias(hoje, -30 - i), createdById: gestor.id,
        },
      });
      await prisma.stockMove.create({
        data: {
          materialId: material.id, kind: 'SAIDA', qty: 2,
          vehicleId: comCarro[i % comCarro.length].veiculoId,
          notes: 'Aplicado em reparação',
          occurredAt: maisDias(hoje, -10 - i), createdById: gestor.id,
        },
      });
      movimentos += 2;
    }
    console.log(`[frota-exemplo]   ${MATERIAIS.length} materiais e ${movimentos} movimentos de stock`);
  });

  console.log('\n[frota-exemplo] Pronto.');
  console.log(`  Entra em:  ${emailGestor}`);
  console.log('  Password:  (a que puseste em DEMO_PASSWORD — não é impressa)');
  console.log('  Os motoristas usam a mesma password.\n');
  console.log('  Nota: os documentos e os recibos não têm ficheiro por trás.');
  console.log('  Na lista aparecem bem; não abras a pré-visualização para fotografar.\n');
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ANTES DE ABRIR ISTO AO PÚBLICO                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Esta frota serve para tirar capturas. Para virar conta de demonstração com
// a password escrita no site, falta decidir três coisas — e nenhuma delas é
// código a mais, são escolhas:
//
//  1. O que é que um visitante pode estragar. Hoje entra como ADMIN e mexe em
//     tudo, incluindo apagar. Numa conta pública, alguém vai apagar — não por
//     maldade, por experimentar. Ou se repõe a frota de tempos a tempos, ou a
//     conta entra com um papel que vê tudo e não escreve nada.
//  2. Email. A conta não deve conseguir disparar emails para lado nenhum.
//  3. Abuso. É uma conta com a password publicada; vale a pena limitar o que
//     se pode fazer com ela por hora.
//
// Até isso estar decidido, `DEMONSTRACAO.activa` fica a `false` no site e esta
// frota é só tua.

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
