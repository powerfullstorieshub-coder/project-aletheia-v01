import { Router, type IRouter, type Request, type Response } from "express";
import {
  CalculateExpressionBody,
  CalculateExpressionResponse,
  type CalculationErrorCode,
} from "@workspace/api-zod";
import { calculateExpression } from "@workspace/calculation-engine";

const router: IRouter = Router();

const sendError = (
  res: Response,
  status: number,
  code: CalculationErrorCode,
  message: string,
): void => {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
};

const engineErrorCodes: Record<string, CalculationErrorCode> = {
  division_by_zero: "DIVISION_BY_ZERO",
  modulo_by_zero: "MODULO_BY_ZERO",
  unsupported_syntax: "UNSUPPORTED_OPERATION",
  expression_too_long: "EXPRESSION_TOO_LONG",
  expression_too_complex: "EXPRESSION_TOO_COMPLEX",
};

router.post("/calculate", (req: Request, res: Response): void => {
  if (!req.is("application/json")) {
    sendError(
      res,
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    );
    return;
  }

  const parsed = CalculateExpressionBody.safeParse(req.body);
  const hasOnlyExpression =
    req.body !== null &&
    typeof req.body === "object" &&
    !Array.isArray(req.body) &&
    Object.keys(req.body).length === 1 &&
    Object.hasOwn(req.body, "expression");

  if (!parsed.success || !hasOnlyExpression) {
    sendError(
      res,
      400,
      "INVALID_REQUEST",
      "Provide a JSON object containing only an expression string of 1–256 characters.",
    );
    return;
  }

  const result = calculateExpression(parsed.data.expression);
  if (!result.ok) {
    const code = engineErrorCodes[result.error.code] ?? "INVALID_EXPRESSION";
    sendError(res, 422, code, result.error.message);
    return;
  }

  const response = CalculateExpressionResponse.parse({
    success: true,
    expression: parsed.data.expression,
    result: result.value,
  });

  res.status(200).json(response);
});

export default router;
