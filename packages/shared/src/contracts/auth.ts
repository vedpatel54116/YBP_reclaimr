import { API_PREFIX } from "../constants";
import {
  authResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  userSchema,
} from "../schemas/auth";

/**
 * API contract for the auth endpoints. Routes in apps/api validate inputs
 * against these schemas and the web client types its requests from them, so
 * the wire format cannot drift between server and frontend.
 */
export const authContract = {
  register: {
    method: "POST",
    path: `${API_PREFIX}/auth/register`,
    body: registerRequestSchema,
    response: authResponseSchema,
  },
  login: {
    method: "POST",
    path: `${API_PREFIX}/auth/login`,
    body: loginRequestSchema,
    response: authResponseSchema,
  },
  refresh: {
    method: "POST",
    path: `${API_PREFIX}/auth/refresh`,
    body: refreshRequestSchema,
    response: authResponseSchema,
  },
  logout: {
    method: "POST",
    path: `${API_PREFIX}/auth/logout`,
    body: logoutRequestSchema,
  },
  me: {
    method: "GET",
    path: `${API_PREFIX}/auth/me`,
    response: userSchema,
  },
} as const;
