/** Error payload returned by every failed API request. */
export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Envelope for paginated list endpoints. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
