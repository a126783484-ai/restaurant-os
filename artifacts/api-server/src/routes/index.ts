import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import customersRouter from "./customers";
import tablesRouter from "./tables";
import reservationsRouter from "./reservations";
import productsRouter from "./products";
import ordersRouter from "./orders";
import staffRouter from "./staff";
import dashboardRouter from "./dashboard";
import paymentsRouter from "./payments";
import inventoryRouter from "./inventory";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(customersRouter);
router.use(tablesRouter);
router.use(reservationsRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(staffRouter);
router.use(dashboardRouter);
router.use(paymentsRouter);
router.use(inventoryRouter);
router.use(aiRouter);

export default router;
