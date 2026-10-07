# Changelog

## 0.1.0 — 7 October 2026

Slate's first public source release provides a core wiki with pages and containers, rich-text editing, sharing and permissions, comments, search, revision history, imports, and portable backup and restore. It includes email sign-in and first-owner setup, edition metadata, deployment commands, and corrections to page relocation and erasure. Advanced federation and inquiry remain development features outside this release's acceptance.

### MAIL-002 amendment — 7 October 2026

Base Mail adds SendGrid alongside Resend. Automatic retry is allowed only when the provider suppresses duplicate requests. SendGrid rejections permit an owner retry; ambiguous transport, expired dispatch ownership or missing acceptance receipts are held durably for provider review without a blind resend. Resend's bounded idempotent retry remains. A provider receipt means acceptance, not inbox delivery. CONTRACT.md and RELEASE.json retain this amendment.

Incumbent import fixtures use synthetic identities while retaining archive and parser edge cases. Source documentation describes reproducible setup and verification; historical private execution logs are excluded.
