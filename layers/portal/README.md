# Portal layer

The client-facing surface of the Eiretech Client Portal, packaged as a Nuxt layer so it stays separable from the owner
console.

- `pages/portal/**` — dashboard, projects, project workspace, scope questionnaire, account
- `components/` — portal-only components (scope questions, scope status card, page header)
- `composables/useScope.ts` — client scope state

Every page here assumes a `CLIENT` session. Data comes exclusively from `server/api/portal/*`, which pins each query to
the organisation in the session.
