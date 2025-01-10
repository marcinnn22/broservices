import { Response } from "express";
import { ErrorCode } from "./errorCodes";

export class ApiResponse {
  static success(
    res: Response,
    message: string,
    data?: any,
    statusCode: number = 200
  ) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    stack?: string
  ) {
    const response: any = {
      success: false,
      message,
      code,
    };

    if (process.env.NODE_ENV === "development" && stack) {
      response.stack = stack;
    }

    return res.status(statusCode).json(response);
  }
}
