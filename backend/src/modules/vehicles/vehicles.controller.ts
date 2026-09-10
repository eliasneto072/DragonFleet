import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { vehiclesService } from './vehicles.service';
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleIdParamSchema,
  userIdParamSchema,
  assignVehicleSchema,
  assignmentLookupSchema,
} from './vehicles.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }

  return { id: req.user.id, role: req.user.role };
}

export class VehiclesController {
  list = async (req: AuthRequest, res: Response) => {
    const vehicles = await vehiclesService.list(getActor(req));
    return ok(res, { vehicles });
  };

  listByUser = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });
    const vehicles = await vehiclesService.listByUser(getActor(req), parsed.params.userId);
    return ok(res, { vehicles });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const parsed = vehicleIdParamSchema.parse({ params: req.params });
    const vehicle = await vehiclesService.getById(getActor(req), parsed.params.id);
    return ok(res, { vehicle });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = createVehicleSchema.parse({ body: req.body });
    const actor = getActor(req);
    const userId = actor.id;

    const vehicle = await vehiclesService.create(actor, userId, parsed.body);
    return ok(res, { vehicle }, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = updateVehicleSchema.parse({
      params: req.params,
      body: req.body,
    });

    const vehicle = await vehiclesService.update(
      getActor(req),
      parsed.params.id,
      parsed.body
    );

    return ok(res, { vehicle });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = vehicleIdParamSchema.parse({ params: req.params });
    await vehiclesService.remove(getActor(req), parsed.params.id);
    return res.status(204).send();
  };

  // ── Atribuição ─────────────────────────────────────────────────────────────

  assign = async (req: AuthRequest, res: Response) => {
    const parsed = assignVehicleSchema.parse({ params: req.params, body: req.body });
    const vehicle = await vehiclesService.assign(getActor(req), parsed.params.id, parsed.body.userId);
    return ok(res, { vehicle });
  };

  unassign = async (req: AuthRequest, res: Response) => {
    const parsed = vehicleIdParamSchema.parse({ params: req.params });
    const vehicle = await vehiclesService.unassign(getActor(req), parsed.params.id);
    return ok(res, { vehicle });
  };

  /**
   * GET /vehicles/assignments/lookup?plate=&from=&to=
   *
   * O `recordedAt` que vai em cada linha e o `startedAt` da atribuicao. Nao e
   * redundante com o periodo: e o unico carimbo temporal que a tabela tem, e a
   * tela precisa dele para poder avisar quem le que um registo feito muito
   * depois do facto vale menos do que um feito na hora.
   */
  assignmentLookup = async (req: AuthRequest, res: Response) => {
    const parsed = assignmentLookupSchema.parse({ query: req.query });

    const result = await vehiclesService.lookupAssignmentsByPlate(
      getActor(req),
      parsed.query,
    );

    return ok(res, result);
  };

  assignmentHistory = async (req: AuthRequest, res: Response) => {
    const parsed = vehicleIdParamSchema.parse({ params: req.params });
    const history = await vehiclesService.getAssignmentHistory(getActor(req), parsed.params.id);
    return ok(res, { history });
  };

  // GET /vehicles/driver/:userId/assignments
  // O inverso de assignmentHistory: que carros esta pessoa conduziu.
  driverVehicleHistory = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });
    const history = await vehiclesService.getDriverVehicleHistory(
      getActor(req), parsed.params.userId,
    );
    return ok(res, { history });
  };

  forceActivation = async (req: AuthRequest, res: Response) => {
    const parsed = vehicleIdParamSchema.parse({ params: req.params });
    const forced = req.body?.forced !== false; // default true
    const vehicle = await vehiclesService.setForcedActivation(getActor(req), parsed.params.id, forced);
    return ok(res, { vehicle });
  };
}

export const vehiclesController = new VehiclesController();