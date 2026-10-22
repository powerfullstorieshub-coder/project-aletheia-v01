import { Router, type IRouter } from "express";
import calculationRouter from "./calculate";

const router: IRouter = Router();

router.use(calculationRouter);

export default router;
