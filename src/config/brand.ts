import brandConfig from './brand.json';

export const BRAND = {
  displayName: brandConfig.displayName,
  tagline: brandConfig.tagline,
  contactEmail: brandConfig.contactEmail,
  appStore: brandConfig.appStore,
  urls: brandConfig.urls,
} as const;
