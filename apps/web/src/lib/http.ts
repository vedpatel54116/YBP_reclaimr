import type { ApiErrorResponse } from "@reclaimr/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Typed request error carrying the HTTP status and the API's stable code. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * JSON request that throws on failure, for flows that must distinguish error
 * causes (auth forms, onboarding). This complements `lib/api`, whose helpers
 * swallow errors and return null for dashboard display data.
 */
export async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("Network request failed", 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as Partial<ApiErrorResponse>;
      message = body.message ?? message;
      code = body.error;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiRequestError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
