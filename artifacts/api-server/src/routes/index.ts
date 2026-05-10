import { Router, type IRouter } from "express";
import healthRouter from "./health";
import customersRouter from "./customers";
import tablesRouter from "./tables";
import reservationsRouter from "./reservations";
import productsRouter from "./products";
import ordersRouter from "./orders";
import staffRouter from "./staff";
import dashboardRouter from "./dashboard";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(customersRouter);
router.use(tablesRouter);
router.use(reservationsRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(staffRouter);
router.use(dashboardRouter);
router.use(paymentsRouter);

export default router;
