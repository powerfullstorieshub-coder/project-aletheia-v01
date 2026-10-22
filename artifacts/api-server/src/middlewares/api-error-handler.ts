import type { ErrorRequestHandler } from "express";
import type { CalculationErrorCode } from "@workspace/api-zod";

const apiErrorHandler: ErrorRequestHandler = (error, req, res, next): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const parserError = error as { type?: string };
  if (parserError?.type === "entity.too.large") {
    res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE" satisfies CalculationErrorCode,
        message: "Request body exceeds the 8 KiB limit.",
      },
    });
    return;
  }

  if (parserError?.type === "entity.parse.failed") {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON" satisfies CalculationErrorCode,
        message: "Request body must contain valid JSON.",
      },
    });
    return;
  }

  req.log.error({ err: error }, "Unhandled API request error");
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR" satisfies CalculationErrorCode,
      message: "An unexpected server error occurred.",
    },
  });
};

export default apiErrorHandler;
