import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validate request body against a Zod schema.
 * Attaches parsed data to req.body.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(err);
      } else {
        next(err);
      }
    }
  };
}

/**
 * Validate request query against a Zod schema.
 * Attaches parsed data to req.query.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as Record<string, string>;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validate request params against a Zod schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as Record<string, string>;
      next();
    } catch (err) {
      next(err);
    }
  };
}
