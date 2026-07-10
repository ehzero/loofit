import brandConfig from './brand.json';

export const BRAND = {
  displayName: brandConfig.displayName,
  tagline: brandConfig.tagline,
  urls: brandConfig.urls,
} as const;
