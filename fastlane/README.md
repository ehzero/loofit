# App Store listing automation

Fastlane manages the App Store product-page text, screenshots, and optional preview videos in this directory. EAS remains responsible for building and submitting the iOS binary.

## Initial setup

1. Install a maintained Ruby version and Bundler. Do not use the macOS system Ruby.
2. Run `bundle install`.
3. Create an App Store Connect API key with access to the app.
4. Copy `fastlane/.env.example` to `fastlane/.env` and fill in the key values.
5. Verify the public URLs under `fastlane/metadata/<locale>` before uploading metadata.

The `.p8` key and `fastlane/.env` are ignored by Git and must never be committed. Team API keys require `ASC_ISSUER_ID`; individual API keys must leave it empty.

## Commands

```sh
npm run store:metadata
npm run store:screenshots
npm run store:listing
```

All lanes skip binary upload and never submit the app for review. `APP_STORE_VERSION` is required so automation cannot update an unintended editable version. Screenshot lanes also stop before contacting App Store Connect when no PNG or JPEG files exist.

The Korean listing manages only values confirmed by the product and repository. `support@physiquehub.kr` is used in the public description and App Review contact. The primary category is Health & Fitness (Fastlane value: `HEALTH_AND_FITNESS`); a secondary category is intentionally omitted.

The privacy-policy, customer-support, marketing, terms, and account-deletion URLs use the public GitHub Pages site at `https://ehzero.github.io/loofit-legal/`. App Store Connect has no separate localized terms-of-service URL field, so the terms URL is managed by the app's brand configuration. Review notes must explain the Kakao and Apple login paths and whether the reviewer can use provider-owned credentials; do not claim that the app has no login.

## Directory policy

- `metadata/<locale>` contains localized text files.
- `metadata/review_information` contains the complete App Review contact and notes.
- `screenshots/<locale>` contains ordered PNG or JPEG screenshots.
- `app-previews/<locale>` contains optional App Preview videos.
- Prefix screenshots with `01_`, `02_`, and so on to keep their App Store order stable.
- Keep source screenshots at an Apple-supported resolution. Use Git LFS before committing large screenshot sets.

The current iPhone target is the 6.9-inch portrait size. Apple accepts supported dimensions including 1320×2868, 1290×2796, and 1260×2736 pixels. Add iPad screenshots as well while the app declares iPad support.
