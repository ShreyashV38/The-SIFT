---
name: vanilla-uiux-design-system
description: Comprehensive UI/UX redesign and design-system workflow for vanilla HTML, CSS, and JavaScript applications. Specializes in multi-tenant IoT/smart-home platforms, responsive layouts, accessible typography, cohesive color palettes, and production-grade frontend polish.
---

# Vanilla UI/UX Design System & Polish Workflow

This skill guides end-to-end design system creation, UI/UX polish, and responsive accessibility improvements for vanilla HTML/CSS/JS applications.

## Design Philosophy for The-SIFT
- **Domain**: Multi-tenant IoT smart-home automation platform with isolated household boundaries.
- **Brand Identity**:
  - Primary Navy: `#21295C` (structured, deep, authoritative)
  - Mid Teal: `#1C7293` (technical, balanced, calm)
  - Cyan-Teal Accent: `#2EE6D6` (vibrant, focused telemetry/status indicators)
  - Surfaces: Cool clean light surfaces (`#F8FAFC`, `#FFFFFF`, `#F1F5F9`) with crisp borders (`#E2E8F0`, `#CBD5E1`) and deep high-contrast text (`#0F172A`, `#334155`).
  - Dark App Shell / Topbar / Navigation: High-clarity deep navy shell providing immediate grounding and visual hierarchy.
  - Subtle voxel motif: Refined geometric badges and icon framing honoring the 4D/spatial concept without being childish.

## Workflow Phases
1. **Systemic Audit**: Enumerate all routes, forms, modals, tables, and device controls.
2. **Design Tokens (`styles.css`)**: Centralize CSS custom properties for colors, shadows, radii, spacing, typography, transitions, and z-indices.
3. **Application Shell & Navigation**: Clean header with tenant badge, active route indicator, user profile chip, responsive mobile drawer/toggle.
4. **View Refinement**:
   - `home.js`: High-level household overview, real status cards, quick device actions, environment metrics.
   - `devices.js`: Filterable, searchable device grid/table with online/offline telemetry, quick toggle, signal strength, and type badges.
   - `device-detail.js`: Telemetry charts/history, real-time status, MQTT topic info, parameter controls.
   - `add-device.js`: Multi-step or categorized wizard with connection instructions, QR/token preview, validation.
   - `members.js`: Household members list, invite form, roles/permissions badges, tenant boundary clarity.
   - `plan.js`: Plan comparison, device tier limits, membership switcher, renewal status.
   - `create-household.js`: Onboarding experience with clear steps and feedback.
   - `login.js` & `register.js`: Polished auth card, inline validation, 2FA OTP prompt, password visibility toggle.
   - `help.js`: Documentation, system architecture overview, troubleshooting guides.
5. **Interactive Polish & Accessibility**:
   - Keyboard focus rings (`:focus-visible`).
   - ARIA roles, labels, and status announcements.
   - Responsive breakpoints (360px mobile, 768px tablet, 1200px+ desktop).
   - High contrast ratios (WCAG AA).
   - Smooth transitions with `prefers-reduced-motion` fallbacks.
6. **Browser Preview & Verification**: Inspect rendered DOM, test interactive flows, verify zero console errors.
