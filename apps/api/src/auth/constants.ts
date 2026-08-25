const configuredSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === 'production' && !configuredSecret) {
  throw new Error('JWT_SECRET must be configured when NODE_ENV=production');
}

export const jwtConstants = {
  // A development-only fallback keeps local onboarding simple. Production must
  // provide a unique, rotated secret through the deployment environment.
  secret: configuredSecret || 'development-only-change-me',
};
