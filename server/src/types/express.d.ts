import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      name: string;
      role: string;
      site_ids: string[] | null;
    };
    device?: {
      id: string;
      site_id: string;
      type: string;
      config: Record<string, unknown>;
    };
  }
}
