// Helpers para construir respuestas API consistentes.

import type { Response } from 'express';

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: Pagination;
}

export interface ApiFailure {
  success: false;
  error: string;
  code: string;
  details?: unknown;
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(status).json(body);
}

export function paginated<T>(
  res: Response,
  data: T[],
  pagination: Pagination,
  status = 200,
): Response {
  const body: ApiSuccess<T[]> = { success: true, data, pagination };
  return res.status(status).json(body);
}

export function fail(res: Response, status: number, error: string, code: string, details?: unknown): Response {
  const body: ApiFailure = { success: false, error, code, ...(details !== undefined && { details }) };
  return res.status(status).json(body);
}

export function buildPagination(total: number, page: number, limit: number): Pagination {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
