# THE-SIFT — Premium UI/UX Redesign and Frontend Improvement

Act as a senior UI/UX designer, frontend engineer, design systems architect, and IoT dashboard specialist. Your task is to transform my existing frontend into a polished, distinctive, production-quality interface for **The-SIFT: Multi-Tenant IoT Smart-Home Automation Platform**.

Do not just suggest improvements. Inspect the existing project, plan the redesign, implement it in the codebase, run the application, and verify the results.

## 1. FIRST: Inspect the project and available tools

Before changing any code:

1. Inspect the complete project structure and identify the current HTML, CSS, JavaScript, assets, routes, reusable components, backend API integrations, and existing UI.
2. Read the project documentation and the available Business Requirements Document (BRD), if present.
3. **Discover all skills, MCP servers, tools, and relevant integrations available in this Antigravity environment.** Inspect their descriptions and instructions before deciding which to use.
4. Identify skills and MCP tools relevant to:
   - UI/UX design and design systems
   - Frontend development and code quality
   - Browser automation and visual inspection
   - Accessibility and responsive design
   - Icon libraries, typography, and visual assets
   - Screenshot capture, testing, and debugging
   - Documentation and project analysis
5. Use the relevant available skills and MCP tools throughout the workflow. If multiple tools provide distinct useful capabilities, combine them. Do not assume a tool is available without verifying it.
6. Do not blindly invoke every tool. Use every relevant capability, but avoid redundant calls, unrelated tools, unnecessary installations, and changes that could damage the project.
7. If a skill is installed but not automatically active, read its instructions and follow its workflow when applicable. If an MCP connection is unavailable, continue with the best available alternative and report the limitation.
8. Before editing, identify the current implementation and make a short plan. Preserve existing working functionality.

## 2. Project context and design goals

The-SIFT is a cloud-native, multi-tenant IoT smart-home automation platform. It combines smart-home device management, telemetry, tenant isolation, centralized fleet monitoring, and administrative operations.

The interface must communicate three qualities:

- **Intelligent:** live device telemetry, meaningful status indicators, clear visualizations.
- **Secure:** visible tenant context, access-aware navigation, clear permission boundaries.
- **Operational:** a professional control center for managing devices, tenants, services, and system health.

Create a distinctive visual identity for The-SIFT. Avoid generic dashboard templates, excessive rounded cards, overused gradients, random neon colors, and layouts that look like ordinary SaaS admin panels.

## 3. Visual direction: SIFT Signal Console

Use a design concept inspired by signal intelligence, connected infrastructure, telemetry streams, and precision control systems.

Suggested design language:

- A refined light interface with warm off-white or very pale grey backgrounds.
- Deep midnight navy or charcoal for navigation and high-contrast elements.
- A distinctive electric teal or cyan accent for active navigation, live telemetry, and primary actions.
- Restrained amber for warnings and muted red for critical faults.
- Clean typography with a strong hierarchy, compact data labels, readable body text, and clear numerical values.
- Subtle grid lines, telemetry-inspired visual details, restrained technical motifs, and precise spacing.
- Crisp borders and carefully controlled shadows instead of putting every element inside a floating card.
- Purposeful transitions and micro-interactions that communicate state changes.
- Consistent iconography. Prefer a verified installed icon library or existing project assets over emoji and arbitrary Unicode symbols.

The design should feel custom-built for an IoT control platform, not copied from a dashboard screenshot. Make the brand recognizable through its typography, navigation, data visualization, status indicators, and layout.

Keep the default interface in light mode. Do not introduce an automatic dark-mode switch unless the existing requirements explicitly demand it.

## 4. Build around the actual user workflows

Inspect the existing pages and adapt the following recommendations to the actual routes, roles, and functionality present in the project.

### A. Main dashboard

Create a useful operational overview featuring:

- Registered devices and their online/offline states.
- Live or most recently received telemetry.
- Device connectivity and alert summaries.
- Recent events and command activity.
- Tenant or workspace context where appropriate.
- Service and infrastructure health, if the backend exposes those details.
- Clear actions for navigating to devices, telemetry, and settings.

Use real API data wherever available. Do not invent live readings or claim that a service is healthy when its state is unknown.

### B. Device management

Design an organized device inventory with:

- Search, filtering, and sorting.
- Device name, type, connectivity, last-seen time, and relevant measurements.
- Clear online, offline, warning, and unknown states.
- Device details and telemetry history.
- Appropriate device registration, credential rotation, revocation, and command controls where these functions exist.
- Loading, empty, error, and confirmation states.

### C. Telemetry and analytics

Create a dedicated telemetry experience with:

- Readable time-series charts.
- Appropriate units, time ranges, timestamps, and legends.
- Useful filters for devices, measurements, and periods.
- Recent events and telemetry history.
- Clear distinction between current values, historical values, and unavailable data.

Use existing charting libraries where appropriate. If none exists, select a lightweight option only after inspecting project dependencies and compatibility. Do not fabricate telemetry to make charts look populated.

### D. Tenant and workspace management

Tenant isolation is central to this project. Make the active tenant or workspace visible wherever appropriate.

Include relevant information such as:

- Tenant name and identifier.
- Device usage against the applicable plan limit.
- User and role information.
- Provisioning or service status when supported.
- Clear workspace switching and tenant-specific navigation where implemented.

Never expose another tenant's devices, telemetry, credentials, or administrative controls through a UI shortcut. Enforce access permissions through the backend; frontend visibility alone is not security.

### E. Administration and system health

Where supported by the existing backend, provide:

- Tenant provisioning status.
- Fleet-wide device overview for authorized administrators.
- Service availability and recent operational events.
- Relevant system health information.
- Clear distinctions between tenant-level and platform-level information.

Do not imply that Kubernetes, Magistrala, Home Assistant, ThingsBoard, or other infrastructure components are monitored unless the application actually retrieves that information.

### F. Authentication and account pages

Improve login, registration, account settings, and role-specific interfaces that already exist.

Use consistent forms, inline validation, accessible labels, useful error messages, password visibility controls where appropriate, and clear success or failure feedback.

Do not break existing authentication or account flows.

## 5. Strict technology constraints

My current frontend uses **HTML and CSS**. Preserve this stack.

- Keep existing HTML, CSS, and JavaScript if the project uses JavaScript.
- Do not migrate to React, Vue, Angular, TypeScript, or another framework just to redesign the UI.
- Do not replace the backend, database, authentication, API routes, or deployment architecture.
- Reuse existing libraries and dependencies where practical.
- If JavaScript is needed for interactions, use the existing project approach.
- Avoid adding dependencies unless there is a clear benefit.
- Use reusable CSS patterns, design tokens, and components appropriate to the current architecture.
- Keep the implementation maintainable and understandable.
- Do not add code comments unless necessary for an unavoidable technical reason.

If the repository differs from these assumptions, inspect the actual implementation first and adapt rather than blindly following the prompt.

## 6. Create a consistent design system

Establish CSS custom properties for:

- Brand and semantic colors.
- Backgrounds and surface colors.
- Typography and font sizes.
- Spacing.
- Borders and radii.
- Shadows.
- Navigation dimensions.
- Focus indicators.
- Animation durations.

Standardize buttons, form fields, tables, status badges, navigation, alerts, dropdowns, dialogs, charts, and empty states.

Use a consistent spacing scale and visual hierarchy. Avoid excessive nesting, arbitrary margins, duplicated CSS, and page-specific styling that causes inconsistency.

Prefer semantic HTML and accessible controls. Ensure keyboard navigation, visible focus states, adequate color contrast, and reduced-motion support.

## 7. Responsive design

The application must work properly on:

- Desktop monitors.
- Standard laptops.
- Tablets.
- Mobile screens.

Use CSS Grid, Flexbox, fluid sizing, and sensible breakpoints.

Tables should remain usable on small screens. Navigation should adapt without covering content. Forms and dialogs must fit the viewport. Charts must resize without clipping labels or legends.

Do not merely shrink the desktop layout; rethink how the information should be arranged at smaller widths.

## 8. Functional requirements and safeguards

The redesign must preserve all existing working functionality.

- Inspect API endpoints and existing event handlers before editing.
- Preserve authentication, sessions, role-based access, tenant context, and device actions.
- Do not replace API calls with hardcoded demonstration values.
- Do not create fake buttons, dead links, nonfunctional filters, or decorative controls that appear interactive.
- Do not expose API secrets, MQTT credentials, tokens, or other sensitive values in the frontend.
- Keep authorization enforcement on the backend.
- Add useful loading, empty, error, success, and disabled states.
- Prevent accidental destructive actions with appropriate confirmation dialogs.
- Avoid breaking existing routes, API contracts, or deployment configuration.
- Do not delete project files or perform destructive operations without a demonstrated need and explicit approval.

The BRD is the source of truth for required functionality. Visual improvements must not silently change its requirements.

## 9. Implementation workflow

Execute the following phases.

**Phase 1 — Audit**
- Inspect the codebase and available skills/MCP tools.
- Identify the current pages, user roles, existing features, design problems, and API dependencies.
- Capture baseline screenshots if browser tooling is available.
- Record the main risks and a concise implementation plan.

**Phase 2 — Design**
- Establish the SIFT Signal Console visual direction.
- Define the design tokens and component patterns.
- Decide how navigation, dashboard sections, tables, telemetry, and forms should work.
- Prioritize the pages that users interact with most.

**Phase 3 — Implement**
- Update the actual project files.
- Improve shared navigation and reusable components first.
- Redesign the dashboard, device management, telemetry, tenant management, and account interfaces as applicable.
- Apply responsive styling and meaningful interactions.
- Reuse real assets and verified installed tools wherever appropriate.

**Phase 4 — Verify**
- Start the application using the existing project instructions.
- Use available browser or MCP tools to inspect the running UI.
- Test representative desktop, tablet, and mobile viewport sizes.
- Check navigation, forms, filters, dialogs, API integration, and relevant role-specific flows.
- Check the browser console and server logs for errors.
- Test loading, empty, error, and unknown-data states.
- Fix issues discovered during testing.
- If automated visual testing is unavailable, perform the best feasible manual checks and state the limitation honestly.

**Phase 5 — Final review**
- Compare the redesigned interface with the baseline.
- Check consistency, responsiveness, accessibility, and visual polish.
- Verify that the existing backend and core functionality remain intact.
- Report any requirements that remain incomplete.

## 10. Quality bar

The finished application should look like a serious IoT operations product that could be demonstrated to a technical evaluator or customer.

Prioritize:

1. A distinctive visual identity.
2. Clear information hierarchy.
3. Excellent dashboard and telemetry readability.
4. Consistent tenant context and role-aware navigation.
5. Responsive layouts.
6. Real, working interactions.
7. Maintainable HTML, CSS, and JavaScript.
8. No regressions in existing functionality.

Do not stop after writing a design plan, describing suggested changes, or producing a mockup. Implement the redesign in the existing project.

## 11. Required final report

When finished, provide:

1. **Skills and MCP audit:** which available skills and tools you discovered, which you actually used, what each contributed, and which relevant capabilities were unavailable.
2. **UI changes:** the pages and components redesigned.
3. **Files modified:** the actual file paths and their purpose.
4. **Functional verification:** what you tested and the results.
5. **Screenshots:** before/after comparisons or screenshots of the finished pages, if supported.
6. **BRD alignment:** any relevant user-facing requirements that were preserved or improved.
7. **Known issues:** remaining bugs, incomplete pages, missing integrations, or unverified functionality.
8. **Run instructions:** how to launch the updated application.

Be truthful about which tools were actually used and which tests were actually performed. Do not report a successful test without running it.

Start by auditing the project and available capabilities. Then implement the redesign, verify it, and report the results.