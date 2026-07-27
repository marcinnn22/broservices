import type { AuthPrincipal } from "../application/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      principal?: AuthPrincipal;
    }
  }
}
