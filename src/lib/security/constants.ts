export const MIN_PASSWORD_LENGTH = 10;

export const LOGIN_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
} as const;

export const PASSWORD_RESET_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
} as const;

export const ADMIN_RESET_RATE_LIMIT = {
  limit: 8,
  windowMs: 15 * 60 * 1000,
} as const;
