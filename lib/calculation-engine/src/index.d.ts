export type CalculationError = {
  code: string;
  message: string;
};

export type CalculationResult =
  | { ok: true; value: number }
  | { ok: false; error: CalculationError };

export function calculateExpression(expression: unknown): CalculationResult;
