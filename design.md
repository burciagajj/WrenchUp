# WrenchUp — Design Plan

WrenchUp is an on-demand mobile mechanic service, similar to Uber but for car repairs. Vehicle owners can request a mechanic to come to their location for repairs and routine maintenance. The app is built for mobile portrait orientation (9:16) with one-handed iOS-first usage in mind.

## Brand & Color System

WrenchUp blends the trustworthy feel of automotive service with the speed of a ride-hailing app.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `primary` | `#F97316` (Wrench Orange) | `#FB923C` | Primary CTAs, request button, active states |
| `background` | `#FFFFFF` | `#0B1220` | Screen backgrounds |
| `surface` | `#F5F7FA` | `#111827` | Cards, sheets, elevated tiles |
| `foreground` | `#0F172A` | `#F1F5F9` | Primary text |
| `muted` | `#64748B` | `#94A3B8` | Secondary text |
| `border` | `#E2E8F0` | `#1F2937` | Dividers, card outlines |
| `success` | `#10B981` | `#34D399` | "Mechanic en route", confirmation states |
| `warning` | `#F59E0B` | `#FBBF24` | ETA pressure, surge messaging |
| `error` | `#EF4444` | `#F87171` | Cancellation, invalid states |

Accent dark navy `#0F172A` is used for the "map canvas" stylization since the app does not use a real maps integration; instead it shows a stylized navigation card with ETA, distance, and stepped status.

## Screen List

1. **Home** — Request a mechanic. Vehicle selector, service type, location field, and "Find Mechanic" CTA. Shows promo card and recent jobs preview.
2. **Service Selection** — Modal sheet to choose the type of service (Battery jump, Flat tire, Oil change, Brake service, Diagnostic, Engine repair, AC service, General check-up).
3. **Mechanics List** — Available mechanics sorted by ETA. Each card shows name, photo, rating, vehicle, ETA, distance, and price estimate. Tap to view detail.
4. **Mechanic Detail** — Full profile: bio, specialties, certifications, reviews, gallery of past jobs, "Book Now" CTA.
5. **Confirm Booking** — Summary card showing mechanic, service, location, vehicle, fare breakdown, and Confirm button with haptic.
6. **Tracking** — Live job tracking: stylized map header, mechanic info bar, stepped status (Accepted → On the way → Arrived → In progress → Completed), call/message buttons, cancel option.
7. **Job Complete** — Receipt screen with itemized cost, rate-your-mechanic stars, optional tip, "Done" button.
8. **Activity** — Tab listing past and active jobs with status chips and amounts.
9. **Job History Detail** — Re-open a completed job receipt with rebook option.
10. **Vehicles** — Manage saved vehicles (year, make, model, plate, color). Add/edit/delete.
11. **Profile** — User info, vehicles shortcut, payment method (mock), help, sign-out (mock).

## Primary Content & Functionality

- **Home** displays: greeting, current vehicle pill, "Where are you?" location field (mocked to current address, editable), service-type chip row (Quick: Jump Start, Flat Tire, Oil Change, Diagnostic), big primary "Request a Mechanic" CTA, a promo card ("First service 20% off"), and a horizontal scroll of "Top mechanics near you".
- **Mechanics List** shows live ETA in minutes, rating in stars, hourly rate, and a small badge for specialties (e.g., "EV specialist", "European cars").
- **Tracking** has a stylized top map card (animated dashed route + mechanic puck moving toward house), driver bar with avatar/name/rating/vehicle, status timeline, and footer actions.
- **Activity** shows all past jobs with status filter (All / Active / Completed / Cancelled).
- **Vehicles & Profile** let the user manage saved data persistently with AsyncStorage.

## Key User Flows

1. **Request flow**: Home → tap "Request a Mechanic" → Service Selection sheet → Mechanics List → Mechanic Detail → Confirm Booking → Tracking → Job Complete → Rate & Tip → Activity.
2. **Quick service flow**: Home → tap a quick-service chip → Mechanics List pre-filtered → … same as above.
3. **Active job resume**: Open app while job active → Home shows "Active job" banner → tap to resume Tracking.
4. **Vehicle setup**: Profile → Vehicles → Add Vehicle → save → returns to Home with new vehicle selected.
5. **History review**: Activity → tap completed job → see receipt → "Rebook" → pre-fills Mechanic Detail.

## Tab Bar

Four tabs: **Home** (`house.fill`), **Activity** (`list.bullet`), **Vehicles** (`car.fill`), **Profile** (`person.fill`).

## State & Persistence

- Local store via React Context + `useReducer`, persisted with `AsyncStorage`.
- Entities: `Vehicle`, `Mechanic` (seeded), `ServiceType` (seeded), `Job` (active and history).
- Job state machine: `searching` → `accepted` → `enroute` → `arrived` → `in_progress` → `completed` | `cancelled`.
- ETA timer simulated client-side using `setInterval` while job active.

## Interaction Notes

- Primary CTAs use scale `0.97` + light haptic on press.
- Status transitions during tracking emit medium haptics.
- Job completion triggers success notification haptic.
- All press states implemented via Pressable `style` prop (NativeWind `className` disabled on Pressable per template).

## Out of Scope (v1)

- Real maps / geolocation (we use stylized map + manual location entry).
- Real payments (we show mocked fare and a fake card on file).
- Real auth (single device, local user profile only).
