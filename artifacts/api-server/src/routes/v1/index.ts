import { Router, type IRouter } from "express";
import calculationRouter from "./calculate";
import aiChatRouter from "./ai-chat";

const router: IRouter = Router();

router.use(calculationRouter);
router.use(aiChatRouter);

export default router;
