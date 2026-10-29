# Zambia iPhone preparation

This directory prepares existing Zambia storefronts for iPhone. It does not change the live sites or their Android releases. The catalog in `apps.json` records all 11 existing apps and pins the source commit for each one. All 11 explicit bundle IDs and App Store Connect app records have now been created and independently verified through Apple's API. Their Apple resource IDs are recorded in the catalog. No Zambia build has been uploaded or submitted for review.

## Build coverage

| App | Source repository | Current lane |
| --- | --- | --- |
| ZedMall | zedmall-site | Physical-goods iPhone compile validation |
| ZedGlow | zedglow-site | Physical-goods iPhone compile validation |
| Mwanako | zedbaby-site | Physical-goods iPhone compile validation |
| Chipazi | zedtech-site | Physical-goods iPhone compile validation |
| Kayachi | zedhome-site | Physical-goods iPhone compile validation |
| Zuwango | zedsolar-site | Physical-goods iPhone compile validation |
| AgroMall | agromall-site | Physical-goods iPhone compile validation |
| Vochira | zedcards-site | Digital vouchers: product/payment eligibility review |
| Chibwenzi | zedmatch-site | Dating: native authentication, purchases and moderation verification |
| Lernoto | orizis-academy | Learning: native authentication, digital purchases and account deletion |
| RELJOB | SWIPEJOB | Jobs: native authentication, membership/payment classification and account deletion |

The seven shopping builds bundle the existing HTML, public client assets, Firebase JavaScript SDK, Tailwind styles and Font Awesome. Product data, product images, payment services and Google Fonts still require a network connection. Each app receives its existing brand icon and a matching launch image. The shared native project comes from the pinned, already-built POKERTEN Capacitor template; its display name and assets are replaced and its bundle ID is overridden for the archive. No POKERTEN web content or signing credentials are included.

The bundled checkout now requires an explicit successful payment result. A missing, simulated, unreachable or failed payment service returns the customer to checkout instead of saving an order and displaying success. Tests execute the actual storefront handler with unsuccessful and successful payment outcomes. This fixes the client fallback; it is not a full audit of server-side payment, voucher, fulfillment or order persistence logic.

## Local verification

Requires Node 22 or later. Clone the desired source repository at its pinned commit, then run:

```sh
npm ci --prefix mobile
SOURCE_DIR=/absolute/path/to/source APP_KEY=zedglow npm test --prefix mobile
SOURCE_DIR=/absolute/path/to/source APP_KEY=zedglow npm run build --prefix mobile
```

The CI workflow runs those checks for all seven shopping apps on macOS with Xcode, syncs Capacitor and creates unsigned device archives. It verifies each archive's bundle identifier, display name and packaged assets. All seven passed in [run 40966962639](https://github.com/aaciyoni-bot/zedmall-site/actions/runs/40966962639). Artifacts explicitly say `UNSIGNED`; they cannot be installed through TestFlight and have not been submitted to Apple. The validation workflow requires no signing secrets and does not upload to Apple.

## Prepared signing workflow (not run)

`zambia-testflight.yml` is manual-only and selects one physical-goods app or all seven. It uses the same pinned source/template, repeats checkout tests and packages assets, validates the app-specific distribution profile, signs and verifies the archive and exported IPA, then uploads to App Store Connect for processing. Upload does not submit the app for either beta review or public App Store review.

All seven App Store distribution profiles have been created with the existing distribution certificate. Their active status, CMS signatures, team IDs, bundle IDs, certificate and expiry were verified. Profile resource IDs are recorded in `apps.json`. An isolated `zambia-ios` GitHub environment has been created and restricted to branch `codex/apple-zambia-20261030`.

The environment requires `APPLE_DISTRIBUTION_P12_BASE64`, `APPLE_DISTRIBUTION_P12_PASSWORD`, `APP_STORE_CONNECT_API_KEY`, and `APPLE_PROVISIONING_PROFILES_GZIP_BASE64`. The last value is a base64-encoded gzip containing a JSON map from bundle ID to base64 profile. The seven profiles exceed GitHub's 48 KB per-secret limit as raw JSON; the validated compressed value is 29,260 bytes. The workflow decodes only the selected app's profile to a private runner file and never prints the map or profile content. No secret values belong in this repository, the app, or build artifacts. The current Apple API key can read app/identifier state and upload builds, but registration requests returned 403, so identifiers and profiles were registered through the account UI.

Transfer of the existing signing material to the restricted Zambia environment is approved, but credential installation remains pending. Existing signing secrets remain scoped to the POKERTEN repository. No Zambia signing secrets have been installed and this workflow has not run. The runner deletes its temporary keychain, provisioning files and API key after use.

## Release work still required

1. **Production payments and order fulfillment.** Read-only health checks found `paymentsEnv: sandbox` on zedmall-site, zedglow-site, zedbaby-site, zedtech-site, zedhome-site and zedsolar-site Vercel backends. AgroMall's configured payment URL uses the same ZedGlow backend. A configured gateway is not evidence of a working production payment. Confirm the merchant's live account and test payment, transaction reference, order persistence, fulfillment and refunds before public release. No payment or order was initiated during these checks.
2. **Device QA.** Compile success alone does not verify native-origin CORS, live catalog requests, checkout, deep links, safe-area layout, keyboard behavior, or accessibility. Test these on an iOS simulator and a device; obtain genuine iPhone screenshots.
3. **Four distinct app flows.** Vochira's catalog includes third-party digital gift cards, game credits and crypto vouchers; determine the eligible iOS offering and payment route before porting it unchanged. Chibwenzi requires native sign-in and verification of reporting, blocking, deletion and digital entitlements while preserving its existing free limits. Lernoto sells digital courses. RELJOB uses Google popup login and sells relocation memberships; verify the actual service classification and deletion flow. Do not silently remove functionality or change prices/quotas to force a submission.
4. **Apple setup.** All 11 app identifiers and App Store Connect records, plus distribution profiles for the seven shopping apps, are complete. Install the approved secrets in the restricted environment, create signed IPAs and complete privacy/age-rating/support metadata and review access; then upload and test with TestFlight before App Store review. Existing Android approval does not establish Apple approval. Separate storefronts need a clear, distinct customer purpose under Apple's minimum-functionality and duplicate-app rules.

Apple references: [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (sections 1.2, 3.1, 4.2, 4.3, 4.8 and 5.1.1), [register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id/). Native tooling: [Capacitor iOS](https://capacitorjs.com/docs/ios).

No Zambia app has been submitted to Apple by this change. Do not merge this draft preparation as a claim of commercial release readiness.
