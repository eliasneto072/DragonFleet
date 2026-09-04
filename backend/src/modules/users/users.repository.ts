import { prisma } from "../../config/prisma"
import { logger } from "../../shared/utils/logger"
import { IUserRepository } from "./users.repository.interfaces"
import { IUser, IUserPublic } from "./users.types"
import { CreateUserData, UpdateUserData } from "./users.repository.types"
import {
    buildPageInfo, buildSearchWhere, type PageParams, type Paged,
} from "../../shared/http/pagination"


export class UsersRepository  implements IUserRepository{

    private readonly publicSelect = {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
    } as const

    /**
     * Uma página de utilizadores, com pesquisa e filtros aplicados na BASE.
     *
     * O findAll continua a existir para quem precise mesmo de todos — o
     * emparelhamento de nomes da extensão, por exemplo. Mas as telas passam
     * por aqui: a de Motoristas descarregava os 2000 e filtrava no browser.
     *
     * A ordenação por nome e não por data de criação: numa lista onde se
     * PROCURA alguém, a ordem alfabética é a que deixa encontrar. A ordem de
     * inscrição só interessa a quem quer ver as entradas recentes, e para isso
     * existe o filtro.
     */
    async findManyPaged(
        filter: {
            role?: string; status?: string; terms?: string[];
            /** 'pending' = tem documentos à espera de decisão ou por corrigir. */
            pending?: 'pending' | 'clear';
            sort?: 'name' | 'recent';
        },
        page: PageParams,
    ): Promise<Paged<IUserPublic>> {
        try {
            // O filtro de pendências tem de viver AQUI e não no browser.
            //
            // A tela cruzava a lista de utilizadores com a de documentos do
            // lado do cliente. Com paginação isso passaria a cruzar apenas os
            // 25 visíveis: filtrar por "tem pendências" devolveria os que
            // calhassem estar nesta página, e a pessoa concluiria que os
            // outros já estavam tratados.
            //
            // `some` e `none` são filtros de relação: o Postgres resolve-os
            // com uma subconsulta e nunca traz os documentos para cá.
            const porResolver = { status: { in: ['PENDING', 'REJECTED', 'EXPIRED'] as never[] } }
            const pendencias =
                filter.pending === 'pending' ? { documents: { some: porResolver } }
                : filter.pending === 'clear' ? { documents: { none: porResolver } }
                : {}

            const where = {
                ...(filter.role ? { role: filter.role as never } : {}),
                ...(filter.status ? { status: filter.status as never } : {}),
                ...pendencias,
                ...buildSearchWhere(filter.terms ?? [], ['name', 'email']),
            }

            const [rows, total] = await Promise.all([
                prisma.user.findMany({
                    where,
                    select: {
                        ...this.publicSelect,
                        // Contagem de documentos por resolver, feita na BASE.
                        //
                        // A tela mostra um distintivo por motorista e chegava lá
                        // descarregando TODOS os documentos — 8000 com 2000
                        // motoristas — para os cruzar no browser. O Postgres
                        // conta-os numa subconsulta e devolve um número.
                        _count: { select: { documents: { where: porResolver } } },
                    },
                    orderBy: filter.sort === 'recent'
                        ? { createdAt: 'desc' as const }
                        : { name: 'asc' as const },
                    skip: page.skip,
                    take: page.pageSize,
                }),
                prisma.user.count({ where }),
            ])

            // Achata o _count num campo simples: as telas recebem um número e
            // não um objeto aninhado que teriam de saber destrinçar.
            const items = rows.map(({ _count, ...resto }) => ({
                ...resto,
                pendingDocs: _count?.documents ?? 0,
            }))

            return { items: items as IUserPublic[], page: buildPageInfo(page, total) }
        } catch (err) {
            logger.error("Erro ao obter utilizadores paginados", err)
            throw err
        }
    }

    /**
     * Contagens por estado, sobre TODOS os motoristas.
     *
     * A tela mostra "1 842 ativos · 96 bloqueados" e chegava lá contando o
     * array descarregado. Com paginação isso passaria a contar os 25 da página,
     * e os números do topo passariam a mudar conforme se navega.
     */
    async countDriversByStatus(): Promise<Record<string, number>> {
        const linhas = await prisma.user.groupBy({
            by: ['status'],
            where: { role: 'DRIVER' as never },
            _count: { _all: true },
        })
        return Object.fromEntries(linhas.map((l) => [String(l.status), l._count._all]))
    }

    /**
     * Quantas contas ATIVAS existem com um dado papel.
     *
     * Serve uma coisa só: saber se o ADMIN que está prestes a ser despromovido,
     * desativado ou apagado é o último. Sem esta contagem, o sistema fica sem
     * ninguém capaz de mexer nas Configurações ou de criar outro administrador,
     * e a recuperação passa por ir à base de dados à mão.
     *
     * Conta apenas ACTIVE de propósito: um admin desativado não consegue entrar,
     * portanto não conta como saída de emergência.
     */
    async countActiveByRole(role: string): Promise<number> {
        return prisma.user.count({
            where: { role: role as never, status: 'ACTIVE' as never },
        })
    }

    async findAll(): Promise<IUserPublic[]> {
        try{
            
            return await prisma.user.findMany({
               select: this.publicSelect, 
               orderBy: {createdAt: 'desc'} 
              })

        } catch(err) {

            logger.error("Erro ao obter utilizadores", err);
            throw err; // deixa middleware de erro tratar
        
        }
    }

    async findById(id: string): Promise<IUserPublic | null> {
        try {

            return await prisma.user.findUnique({
                where: {id},
                select: this.publicSelect
            })

        }catch(err){

            logger.error('Erro ao obter utilizador', err)
            throw err
        }
    }

    // Devolve o registo COM o hash da palavra-passe. Usado apenas para
    // reautenticação (confirmar a palavra-passe atual antes de alterações
    // sensíveis). Nunca devolver isto numa resposta HTTP.
    async findByIdWithPassword(id: string): Promise<IUser | null> {
        try {

            return await prisma.user.findUnique({ where: { id } })

        } catch(err){

            logger.error('Erro ao obter utilizador por id', err)
            throw err
        }
    }

    // esse retorna com password (usado apenas no auth/login)
    async findByEmail(email: string): Promise<IUser | null> {
        try{

            return await prisma.user.findUnique({ where: {email} })

        } catch(err){
            logger.error('Erro ao obter utilizador por email', err)
            throw err
        }
    }

    async create(data: CreateUserData): Promise<IUserPublic> {
    try {
      return await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          status: data.status,
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error("Erro ao criar utilizador", err);
      throw err;
    }
  }

  async update(id: string, data: UpdateUserData): Promise<IUserPublic> {
    try {
      return await prisma.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.password !== undefined ? { password: data.password } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error("Erro ao atualizar utilizador", err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.user.delete({ where: { id } });
    } catch (err) {
      logger.error("Erro ao apagar utilizador", err);
      throw err;
    }
  }
}

export const usersRepository =  new UsersRepository()
