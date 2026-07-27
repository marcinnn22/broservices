import type { Request } from "express";

const normalizePath = (path: string): string => {
  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized.length === 0 ? "/" : normalized;
};

export function joinHttpPath(...parts: readonly string[]): string {
  return normalizePath(parts.join("/"));
}

export function getRouteTemplate(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  const routePath = route?.path;

  if (typeof routePath !== "string") {
    return "__unmatched__";
  }

  return normalizePath(`${request.routeBasePath ?? request.baseUrl}${routePath}`);
}
