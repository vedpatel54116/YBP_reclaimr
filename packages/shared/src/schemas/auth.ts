import { z } from "zod";

/** Public user record returned by the API. Never includes credentials. */
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(120).nullable(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const registerRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email(),
  /** Enforced again by the API with a real strength check; this is the wire minimum. */
  password: z.string().min(10).max(128),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = refreshRequestSchema;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

/** Token pair issued by register / login / refresh. */
export const tokenPairSchema = z.object({
  accessToken: z.string().min(20),
  /** Seconds until the access token expires; refresh expiry is carried by the token itself. */
  expiresIn: z.number().int().min(1),
  refreshToken: z.string().min(32),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

/** Successful register / login / refresh response. */
export const authResponseSchema = z.object({
  user: userSchema,
  tokens: tokenPairSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Error reasons clients can branch on without parsing messages. */
export const AUTH_ERROR_CODES = ["INVALID_CREDENTIALS", "EMAIL_TAKEN", "INVALID_TOKEN"] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
