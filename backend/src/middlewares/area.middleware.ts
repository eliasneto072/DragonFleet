// src/middlewares/area.middleware.ts
//
// A guarda que impõe as permissões por área.
//
// ─── A REGRA QUE FAZ ISTO SER SEGURO DE APLICAR ─────────────────────────────
//
// Esta guarda só constrange QUEM É DA EQUIPA. Um motorista ou um investidor
// passa em frente sem ser tocado.
//
// Parece uma abertura e é o contrário. As rotas deste sistema são
// partilhadas: o mesmo /withdrawals serve o motorista a pedir a retirada dele
// e o financeiro a aprovar as de toda a gente; o mesmo /documents serve quem
// envia o cartão de cidadão e quem o valida. Quem decide o que um motorista vê
// dos SEUS dados são os serviços, e sempre foi — essa parte não muda.
//
// Se esta guarda também se aplicasse a eles, uma de duas coisas aconteceria:
// ou se dava a todos os motoristas a área DOCUMENTS e a permissão deixava de
// querer dizer nada, ou se partia o portal do motorista. Aplicando-a só à
// equipa, dá para pôr a guarda em ROTEADORES INTEIROS sem partir nada — que é
// o que faz a diferença entre uma permissão real e uma dúzia de guardas
// esquecidas rota a rota.
//
// ─── PORQUE É QUE VAI À BASE A CADA PEDIDO ──────────────────────────────────
//
// Porque tirar o acesso a alguém tem de fazer efeito AGORA. Com as permissões
// no token, só fariam efeito quando a sessão dele expirasse — e é precisamente
// nessa altura que não se quer esperar. Uma consulta indexada é o preço.

import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from './auth.middleware';
import { env } from '../config/env';
import type { UserRole } from '../shared/types/enums';
import { AppError } from '../shared/errors/AppError';
import { permissionsService, ehEquipa } from '../modules/permissions/permissions.service';
import { NOME_DA_AREA, type Access, type Area } from '../modules/permissions/permissions.catalog';

/**
 * Quem está a pedir — mesmo antes de o `authMiddleware` correr.
 *
 * ─── PORQUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Esta guarda é montada à ENTRADA de cada roteador, em `routes.ts`:
 *
 *   router.use('/vehicles', requireArea('FLEET'), vehiclesRouter())
 *
 * e o `authMiddleware` só corre DENTRO de cada roteador. Portanto, quando esta
 * guarda corre, o `req.user` ainda não existe. A primeira versão confiava nele,
 * via `undefined`, e deixava passar — toda a gente, equipa incluída. O sistema
 * de permissões inteiro não impunha nada: o administrador tirava a área a
 * alguém, o menu dessa pessoa deixava de a mostrar, e a API continuava a
 * servir tudo a quem escrevesse o endereço à mão.
 *
 * O teste `permissions.integration.test.ts` já o dizia — "sem a área, a API
 * recusa mesmo escrevendo o endereço à mão" — e falhava.
 *
 * A solução é a que o `denyInvestor` já usa no mesmo nível, pelo mesmo motivo:
 * ler o token aqui. Com `jwt.verify` e o segredo, não `decode` — um token
 * forjado ou expirado não identifica ninguém, e segue para a rota, que
 * devolve 401.
 */
function quemPede(req: AuthRequest): { id: string; role?: UserRole } | null {
  if (req.user?.id) return { id: req.user.id, role: req.user.role };

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  try {
    const p = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as {
      sub?: string; role?: UserRole;
    };
    return p.sub ? { id: p.sub, role: p.role } : null;
  } catch {
    return null;
  }
}

/**
 * Exige um nível de acesso numa área, a quem for da equipa.
 *
 * Usar DEPOIS do authMiddleware:
 *
 *   router.use(authMiddleware);
 *   router.use(requireArea('SETTLEMENTS'));            // ver
 *   router.post('/', requireArea('SETTLEMENTS', 'MANAGE'), c.create);
 */
export function requireArea(area: Area, nivel: Access = 'VIEW') {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      // Sem sessão identificada, esta guarda não tem nada a dizer: ou a rota
      // por baixo exige autenticação e devolve 401 sozinha, ou é
      // deliberadamente pública — o registo de um motorista novo, por exemplo.
      // Responder 401 aqui partia o registo público.
      const quem = quemPede(req);
      if (!quem) return next();

      // Não é da equipa: esta guarda não é sobre ele.
      if (!ehEquipa(quem.role)) return next();

      const pode = await permissionsService.can(quem, area, nivel);
      if (pode) return next();

      return next(new AppError(
        nivel === 'MANAGE'
          ? `Não tem permissão para alterar ${NOME_DA_AREA[area]}.`
          : `Não tem acesso a ${NOME_DA_AREA[area]}.`,
        403,
        'AREA_FORBIDDEN',
      ));
    } catch (err) {
      return next(err);
    }
  };
}
