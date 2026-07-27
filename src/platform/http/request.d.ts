declare global {
  namespace Express {
    interface Request {
      id: string;
      requestId: string;
      routeBasePath?: string;
    }
  }
}

export {};
