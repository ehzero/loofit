import brandConfig from './brand.json';

export const BRAND = {
  displayName: brandConfig.displayName,
  tagline: brandConfig.tagline,
  contactEmail: brandConfig.contactEmail,
  urls: brandConfig.urls,
} as const;
