# Unit Test Coverage Notes

This folder includes the main layout of the app. The current unit tests related to the UI flows check the following areas:

## Deployment Stepper

File:
`src/app/pages/deployment-page/deployment-page.component.spec.ts`

Checked behaviors:

- The correct deployment flow is loaded from the route for:
  - `Slice / OpenStack`
  - `K8s`
  - `Proxmox VM`
- Step 2 stays disabled until Step 1 is fully completed.
- The `Configuration` button unlocks only when the required registrations are completed.
- Navigation from Step 1 to Step 2 works correctly.
- The correct embedded form is shown in Step 2 for each deployment type.
- The deploy action shows the expected started/success state.
- For the Slice flow, `Deploy Slice` stays disabled until the slice configuration is marked complete.

## Registration Forms

File:
`src/app/features/registration/registration-forms.spec.ts`

Checked behaviors:

- Every registration form component is created successfully.
- Required controls are marked with `Validators.required`.
- Optional controls are not marked as required.
- Required controls reject empty values.
- Required controls accept valid values.

Covered form components:

- NFVO registration
- Function registration
- VIM registration
- Location registration
- K8s credentials upload
- K8s cluster registration
- K8s deploy service
- K8s migration
- Kubernetes registration
- PQC slice deployment
- Proxmox cluster registration
- Proxmox registration
- Proxmox VM creation
- Slice registration

## Verification Commands

Useful commands for rerunning the checks:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm test -- --watch=false --include src/app/pages/deployment-page/deployment-page.component.spec.ts
npm test -- --watch=false --include src/app/features/registration/registration-forms.spec.ts
```
