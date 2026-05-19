# WrenchUp — Complete Project Export

**Export Date:** May 14, 2026  
**Version:** 1.3 (Checkpoint: `5a994cce`)  
**Status:** Production-ready MVP

---

## 📦 What's Included

This zip file contains the **complete WrenchUp project** with:

✅ **All source code** (TypeScript + React Native)  
✅ **All assets** (icons, images, branding)  
✅ **Configuration files** (app.config.ts, tailwind.config.js, tsconfig.json, etc.)  
✅ **Unit tests** (37 passing tests)  
✅ **Documentation** (HANDOFF.md, design.md, todo.md, README.md)  
✅ **Hidden files** (.gitignore, .env templates, .webdev/, .manus-logs/)  
✅ **Build scripts** (package.json, pnpm-lock.yaml)  

**Excluded** (to reduce size):
- `node_modules/` (reinstall with `pnpm install`)
- `.expo/` (local cache)
- `dist/` (build output)
- `.git/` (version history)

---

## 🚀 Quick Start

### 1. Extract the zip
```bash
unzip wrenchup-complete.zip
cd wrenchup
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Start development server
```bash
pnpm dev
```

### 4. Run tests
```bash
pnpm test
```

---

## 📋 Project Structure

```
wrenchup/
├── app/                    # Expo Router screens (file-based routing)
│   ├── (tabs)/            # Tab bar: Home, Activity, Vehicles, Profile
│   ├── mechanic/          # Mechanic mode screens
│   ├── service-select.tsx # Service selection
│   ├── mechanics.tsx      # Browse mechanics
│   ├── confirm.tsx        # Booking confirmation
│   ├── tracking.tsx       # Real-time tracking with map
│   ├── complete.tsx       # Job completion + rating
│   └── ...
├── components/            # Reusable UI components
│   ├── live-map.tsx       # Native maps (iOS/Android)
│   ├── live-map.web.tsx   # SVG fallback for web
│   ├── mechanic-home.tsx  # Mechanic dashboard
│   └── ...
├── lib/
│   ├── store.tsx          # Global state + persistence
│   ├── store-reducer.ts   # State machine
│   ├── types.ts           # Domain models
│   ├── fare.ts            # Pricing logic
│   ├── geo.ts             # Geospatial helpers
│   ├── location.ts        # Geolocation + reverse geocoding
│   ├── i18n.ts            # Translations (en, es-MX)
│   ├── notifications.ts   # Push notifications
│   ├── mechanic-sim.ts    # Job simulator
│   ├── __tests__/         # 37 unit tests
│   └── ...
├── hooks/                 # Custom React hooks
├── assets/images/         # App icons, splash, branding
├── server/                # Backend (optional, not used in MVP)
├── HANDOFF.md             # Complete architecture guide
├── design.md              # UI/UX specifications
├── todo.md                # Feature checklist
├── README.md              # Quick start
├── app.config.ts          # Expo configuration
├── package.json           # Dependencies
└── ...
```

---

## ✨ Key Features

### Customer Mode
- 🏠 **Home**: Location, vehicle selector, request CTA, quick services, top mechanics
- 📍 **Service Selection**: Browse 8 service types with pricing
- 👨‍🔧 **Mechanics List**: Sort by ETA/rating/price, real-time distance
- 📋 **Mechanic Detail**: Reviews, ratings, service info, Book Now
- ✅ **Confirm Booking**: Fare breakdown, pickup location, map
- 🗺️ **Tracking**: Live map with animated mechanic puck, status timeline, notifications
- ⭐ **Job Complete**: Rating (1-5 stars), tip options, receipt
- 📜 **Activity**: Job history with status filters
- 🚗 **Vehicles**: Add/edit/delete saved vehicles
- 👤 **Profile**: User info, role toggle, region override

### Mechanic Mode
- 📊 **Dashboard**: Online toggle, daily stats, incoming jobs stream
- 📬 **Incoming Jobs**: 30-second countdown, accept/decline
- 🛠️ **Active Job**: Map, status progression, customer info, earnings

### Advanced Features
- 🌍 **Real Maps**: Apple Maps (iOS) / Google Maps (Android) with native integration
- 📍 **Geolocation**: Foreground location permission, reverse geocoding
- 🔔 **Push Notifications**: Local notifications on job status changes
- 🇲🇽 **Mexico Auto-Detection**: Auto-switches to Spanish (es-MX) + 60% discount
- 💰 **Dynamic Pricing**: Fare calculation with distance + service multiplier
- 🎨 **Dark Mode**: Automatic theme switching
- 📱 **Responsive**: Mobile-first design (portrait 9:16)
- ✅ **37 Unit Tests**: Reducer, fare, geo, i18n (all passing)

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | React Native + Expo | 54 |
| **Language** | TypeScript | 5.9 |
| **Styling** | NativeWind (Tailwind CSS) | 4 |
| **Navigation** | Expo Router | 6 |
| **State** | React Context + Reducer | — |
| **Maps** | react-native-maps | — |
| **Location** | expo-location | — |
| **Notifications** | expo-notifications | — |
| **Haptics** | expo-haptics | — |
| **Testing** | Vitest | 2.1.9 |

---

## 📊 State Management

**Store:** `lib/store.tsx` + `lib/store-reducer.ts`

**Persistence:** AsyncStorage (all state auto-saved)

**Key state:**
- User location + detected country
- Role (customer | mechanic)
- Active job + job history
- Vehicles + selected vehicle
- Region preference + locale
- Theme (light | dark)

---

## 🌍 Localization

**Supported:**
- 🇺🇸 **English (en)** — United States, USD, 100% pricing
- 🇲🇽 **Spanish (es-MX)** — Mexico, MXN, 40% pricing (60% discount)

**Auto-detection:** Reverse geocoding on app launch  
**Manual override:** Profile → Region preference

---

## 🗺️ Maps & Location

- **Native maps** on iOS/Android (react-native-maps)
- **SVG fallback** on web
- **Haversine distance** calculation
- **Mechanic puck animation** along route
- **Reverse geocoding** for address lookup
- **Country detection** for locale switching

---

## 🧪 Testing

**37 passing tests:**
- `store-reducer.test.ts` (7 tests) — State transitions
- `mechanic-reducer.test.ts` (7 tests) — Mechanic actions
- `fare.test.ts` (4 tests) — Pricing logic
- `geo.test.ts` (7 tests) — Distance, interpolation
- `i18n.test.ts` (12 tests) — Translations, discount, locale

**Run tests:**
```bash
pnpm test
```

---

## 📝 Documentation

| File | Purpose |
|------|---------|
| `HANDOFF.md` | Complete architecture, features, data models, API reference |
| `design.md` | UI/UX specifications, screen list, user flows |
| `todo.md` | Feature checklist (all items marked complete) |
| `README.md` | Quick start, project structure, conventions |

---

## 🚀 Development Workflow

### Commands

```bash
# Install dependencies
pnpm install

# Start dev server (Metro + backend)
pnpm dev

# Run on iOS
pnpm ios

# Run on Android
pnpm android

# Run on web
pnpm dev:metro

# Run tests
pnpm test

# Type check
pnpm check

# Format code
pnpm format

# Lint
pnpm lint
```

### File-Based Routing

Routes auto-generated from file structure:
- `app/(tabs)/index.tsx` → Home tab
- `app/mechanics.tsx` → `/mechanics`
- `app/mechanic/[id].tsx` → `/mechanic/:id`
- `app/tracking.tsx` → `/tracking`

### Adding Features

1. **New screen**: Create file in `app/`
2. **New service type**: Add to `ServiceCode` type + seed data + i18n strings
3. **New state**: Add to reducer + persistence keys
4. **New test**: Add to `lib/__tests__/`

---

## 🎨 Branding

**Color Scheme:**
- Primary: Wrench Orange (`#FF8C00`)
- Background: White/Dark (`#FFFFFF` / `#151718`)
- Accent: Success green, warning amber, error red

**Logo:** `assets/images/icon.png` (512×512)

**Theme:** Light + dark mode (automatic)

---

## 📦 Build & Deployment

### Local Build

```bash
pnpm build
```

### Production Build (EAS)

```bash
eas build --platform ios
eas build --platform android
```

### Environment Variables

Create `.env.local` (git-ignored):
```
EXPO_PUBLIC_API_URL=https://your-api.com
```

---

## ⚠️ Known Limitations

1. **Straight-line routing** — Mechanic puck animates in a straight line (not real roads)
2. **Simulated jobs** — Incoming requests generated by simulator, not real customers
3. **Local storage only** — No backend sync; data lost if app uninstalled
4. **No payment** — Tip/payment flow is UI-only
5. **No chat** — Only call button available
6. **No real-time sync** — Job updates don't sync between customer and mechanic

---

## 🔮 Recommended Next Steps

### Phase 1: Backend Integration
- [ ] Set up Firebase or Node.js backend
- [ ] Sync jobs between customer and mechanic in real-time
- [ ] Persist job history + ratings to database
- [ ] Implement user authentication

### Phase 2: Enhanced Routing
- [ ] Integrate OSRM or Google Directions API
- [ ] Animate mechanic puck along actual road polyline
- [ ] Show ETA based on real traffic

### Phase 3: Monetization
- [ ] Integrate Stripe for payment processing
- [ ] Add promo codes / coupon system
- [ ] Implement service fee + commission logic

### Phase 4: Mechanic Features
- [ ] 7-day earnings dashboard with bar chart
- [ ] Service preferences (job types, max distance)
- [ ] Mechanic verification (ID, background check, insurance)
- [ ] Rating + review system

### Phase 5: Customer Features
- [ ] Scheduled bookings (book for future time)
- [ ] In-app chat with mechanic
- [ ] Payment method management
- [ ] Favorite mechanics list

### Phase 6: Operations
- [ ] Admin dashboard (jobs, users, analytics)
- [ ] Dispute resolution system
- [ ] Customer support ticketing
- [ ] Mechanic onboarding flow

---

## 🐛 Troubleshooting

### Dev server won't start
```bash
rm -rf node_modules .expo
pnpm install
pnpm dev
```

### Tests failing
```bash
pnpm test -- --reporter=verbose
```

### Maps not showing
- iOS: Requires Xcode build (not in Expo Go)
- Android: Add Google Maps API key to `app.config.ts`
- Web: Falls back to SVG automatically

### Location permission denied
- iOS: Settings → WrenchUp → Location
- Android: Settings → Apps → WrenchUp → Permissions

---

## 📞 Support

For questions or issues:
1. Check `HANDOFF.md` for detailed architecture
2. Review `design.md` for UI specifications
3. Look at test files in `lib/__tests__/` for implementation examples
4. Check `README.md` for quick start

---

## 📄 License

This project is provided as-is for development and testing purposes.

---

## 📍 Project Info

**Name:** WrenchUp  
**Type:** React Native (Expo) Mobile App  
**Platform:** iOS, Android, Web  
**Status:** Production-ready MVP  
**Version:** 1.3  
**Checkpoint:** `5a994cce`  
**Export Date:** May 14, 2026  

---

**Ready to deploy! 🚀**
