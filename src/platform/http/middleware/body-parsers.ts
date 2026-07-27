import express, { type RequestHandler } from "express";

export function createBodyParsers(limit: string): RequestHandler[] {
  return [
    express.json({
      limit,
      strict: true,
      type: ["application/json", "application/*+json"],
    }),
    express.urlencoded({
      extended: false,
      limit,
      parameterLimit: 100,
    }),
  ];
}
