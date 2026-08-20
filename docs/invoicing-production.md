# Belgian invoicing release gates

Release 1 supports Belgian domestic B2C invoicing and B2B **Peppol XML export**. It does not operate a Peppol Access Point, receive supplier invoices, or claim provider-verified delivery.

## Deployment

1. Deploy with Node.js 22 and apply the forward-only Supabase migration `20260818185720_harden_belgian_invoicing.sql` in a staging project first.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never prefix it with `NEXT_PUBLIC_`.
3. Set `PEPPOL_API_ENABLED=false`. Do not add a production connector to the registry as part of this release.
4. On Supabase Free, leaked-password protection is unavailable. Require strong passwords and enable basic MFA instead; re-enable the leaked-password gate if the project later moves to Pro.
5. Run CI with Java 21. `npm run validate:peppol` downloads KoSIT Validator 1.6.2 and the Peppol BIS 3.0.21 configuration, verifies both SHA-256 hashes, and validates the generated fixtures.

## Mandatory release checks

- Validate representative standard VAT, reverse-charge, mixed-rate, and credit-note XML through a Belgian Peppol portal.
- Obtain Belgian-accountant approval for the PDF layout, the versioned 6% declaration, and reverse-charge wording.
- Verify tenant isolation and RPC grants against a staging database, including concurrent issuance and document retry.
- Confirm issued files cannot be overwritten or deleted through the application or authenticated Storage API.

Until those checks pass, invoicing remains a pre-production feature. Marketing must say “Peppol XML export.” “Peppol-enabled sales invoicing” remains gated on a certified provider adapter, sandbox certification, production onboarding, and a real send/status test. Receiving remains in the contractor’s external provider portal.
