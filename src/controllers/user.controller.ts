import { Request, Response } from "express";
import { UserService } from "@/services/user.service";
import { ApiResponse } from "@/utils/apiResponse";
import { AppError } from "@/utils/appError";

export class UserController {
  constructor(private userService: UserService) {}

  getAll = async (_req: Request, res: Response) => {
    try {
      const users = await this.userService.getAllUsers();
      ApiResponse.success(res, "Users retrieved successfully", users);
    } catch (error) {
      handleError(res, error);
    }
  };

  getUser = async (req: Request, res: Response): Promise<void> => {
    try {
      if (
        !req.user ||
        (req.user.role !== "ADMIN" && req.user.userId !== req.params.id)
      ) {
        ApiResponse.error(res, "Not authorized to access this profile", 403);
        return;
      }
      const user = await this.userService.getUserById(req.params.id);
      ApiResponse.success(res, "User retrieved successfully", user);
    } catch (error) {
      handleError(res, error);
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const user = await this.userService.createUser(req.body);
      ApiResponse.success(res, "User created successfully", user);
    } catch (error) {
      handleError(res, error);
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const user = await this.userService.updateUser(req.params.id, req.body);
      ApiResponse.success(res, "User updated successfully", user);
    } catch (error) {
      handleError(res, error);
    }
  };

  delete = async (req: Request, res: Response) => {
    try {
      await this.userService.deleteUser(req.params.id);
      ApiResponse.success(res, "User deleted successfully");
    } catch (error) {
      handleError(res, error);
    }
  };
}

function handleError(res: Response, error: any) {
  if (error instanceof AppError) {
    ApiResponse.error(res, error.message, error.statusCode);
  } else {
    ApiResponse.error(res, "Internal server error");
  }
}
