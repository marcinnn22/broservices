import { ErrorRequestHandler } from "express";
import { ErrorHandler } from "@/utils/errorHandler";
import { ApiResponse } from "@/utils/apiResponse";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const handledError = ErrorHandler.handle(err, "GlobalErrorHandler");

  ApiResponse.error(
    res,
    handledError.message,
    handledError.statusCode,
    handledError.code
  );
};
