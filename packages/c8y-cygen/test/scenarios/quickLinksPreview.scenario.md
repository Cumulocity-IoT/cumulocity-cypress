# Scenario: Quick links widget config preview stays in sync after changing display options

> M8 scenario for c8y-cygen (PRD §"First slice", M8 stretch goal). Genuinely new
> coverage - there is no hand-written oracle spec for this flow, unlike the M0-M7
> `events.scenario.md`/`events.cy.oracle.ts` pair. Regression coverage for
> [PR #12400](https://github.com/Cumulocity-IoT/cumulocity-ui/pull/12400)
> ("prevent full DOM re-creation in quick links widget preview by replacing inline
> config binding with a signal"): the config preview used to bind `[config]` to a
> fresh inline object literal on every change-detection cycle, so `@for (track link)`
> saw all-new identities and Angular destroyed/recreated every link in the preview on
> each cycle - visibly, links and their icons would disappear. The fix computes
> `previewConfig` from a signal that only changes when the form actually changes.
>
> Deliberately tests this against the widget's own **auto-seeded default quick
> links** (added automatically the first time the widget is configured with no
> existing config - see `resetLinks`/`assignLinksToConfig` in
> `quick-links-widget-config.component.ts`), not manually-added custom links.
> A first pass at this scenario had the agent hand-add two custom links instead,
> which turned out to be a much more expensive path live: the widget has no
> "clear all" affordance (`Reset links` resets *to* the defaults, it does not
> clear them - each must be deleted one at a time), and a manually-added link
> with no icon and no `app` reference does not reliably render an icon in the
> preview (the fallback branch renders `<c8y-app-icon [name]="link.app.name">`,
> which is empty without an `app`). The default links avoid both problems - they
> already carry resolved icons via known `app` references, so there is nothing to
> add, delete, or icon-pick before the actual regression check.

## Objective

Verify that after the Quick Links widget's default set of quick links loads into its
configuration, changing an unrelated display setting does not make any of those links
(or their icons) disappear from the configuration preview.

## Preconditions

- An authenticated session against the target tenant (OAI-Secure login).
- The Cockpit app is reachable at `/apps/cockpit/index.html`.

## Setup

- A device group with an editable dashboard is reachable in the tenant (an existing
  one, already used for other exploration, is fine to browse against - the widget
  being added is what's under test, not the rest of the dashboard's contents).
- *(`integration` style: create the group and its dashboard the same way the rest of
  the Cockpit widget suite does (see `cockpitWidgets.cy.ts`), via
  `cy.createGroup`/`cy.request`, with a known, unique group name (e.g.
  `` e2eGroupToTestQuickLinksPreview${Cypress._.now()} ``). `mocked` style: serve a
  group with that same kind of unique name and a dashboard inventory response via
  `cy.intercept`, following the `prepareGroupWithDashboard` pattern already used in
  `cockpitWidgets.cy.ts` — discover the exact request/response shape by exploring
  against whatever group/dashboard is already reachable, rather than creating a
  brand-new one live just to look at it.)*

## Steps

1. Log in.
2. Navigate to the group's dashboard:
   `/apps/cockpit/index.html#/group/{groupId}/dashboard/{dashboardId}`.
3. Enter widget-edit mode and start adding a new widget.
4. From the widget catalog, select the "Quick links" widget type to open its
   configuration. Do not touch the "Links" section - let its default set of links
   load as-is.
5. In the configuration's preview pane, note the full set of default quick links
   shown (their labels).
6. Change the "Display as" option to its other value (Grid ↔ List).
7. Save the widget.

## Expected Outcomes

1. Before changing "Display as" (Step 5), the configuration preview shows the widget's
   default quick links, each with a visible icon.
2. After changing "Display as" (Step 6), the configuration preview still shows the
   exact same set of quick links from Step 5 - same labels, same count, each still
   with a visible icon. None disappeared and none was duplicated.
3. After saving (Step 7), the widget on the dashboard shows that same set of quick
   links, each as a clickable element.

## Style

`mocked` (this widget's own configuration is pure client-side form state; only the
surrounding dashboard/group inventory calls need mocking, matching the pattern already
used for other widgets in the Cockpit widget suite).
