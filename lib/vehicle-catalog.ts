// Vehicle make -> model -> trim -> engine catalog for the "Add vehicle" form
// (app/vehicle-form.tsx). Deliberately nested this deep (not flat per-make
// lists) because trim and engine aren't independent choices in real life —
// a Corolla LE and a Camry TRD don't share a trim ladder, and within one
// model the engine on offer often depends on which trim you picked (e.g. a
// Hybrid engine usually only shows up on specific trims, not the whole
// lineup). The form gates the pickers to match: Model unlocks after Make,
// Trim unlocks after Model, Engine unlocks after Trim.
//
// Trim names/engines reflect typical recent-model-year U.S. lineups. Real
// trim availability shifts by model year and market, so treat this as "close
// enough to be useful," not a VIN-exact spec sheet.

export type VehicleTrimCatalog = Record<string, { engines: string[] }>;
export type VehicleModelCatalog = Record<string, { trims: VehicleTrimCatalog }>;
export type VehicleMakeCatalog = Record<string, { models: VehicleModelCatalog }>;

export const VEHICLE_CATALOG: VehicleMakeCatalog = {
  Toyota: {
    models: {
      Corolla: { trims: { L: { engines: ["2.0L I4"] }, LE: { engines: ["2.0L I4"] }, SE: { engines: ["2.0L I4"] }, XLE: { engines: ["2.0L I4", "Hybrid"] }, XSE: { engines: ["2.0L I4", "Hybrid"] } } },
      "Corolla Cross": { trims: { L: { engines: ["2.0L I4"] }, LE: { engines: ["2.0L I4"] }, XLE: { engines: ["2.0L I4"] }, "Hybrid LE": { engines: ["Hybrid"] }, "Hybrid XLE": { engines: ["Hybrid"] } } },
      Camry: { trims: { LE: { engines: ["2.5L I4", "Hybrid"] }, SE: { engines: ["2.5L I4", "Hybrid"] }, XLE: { engines: ["2.5L I4", "3.5L V6", "Hybrid"] }, XSE: { engines: ["2.5L I4", "3.5L V6", "Hybrid"] }, TRD: { engines: ["3.5L V6"] } } },
      Prius: { trims: { LE: { engines: ["Hybrid"] }, XLE: { engines: ["Hybrid", "Plug-In Hybrid"] }, Limited: { engines: ["Hybrid", "Plug-In Hybrid"] }, Nightshade: { engines: ["Hybrid"] } } },
      RAV4: { trims: { LE: { engines: ["2.5L I4", "Hybrid"] }, XLE: { engines: ["2.5L I4", "Hybrid"] }, "XLE Premium": { engines: ["2.5L I4", "Hybrid"] }, Adventure: { engines: ["2.5L I4", "Hybrid"] }, Limited: { engines: ["2.5L I4", "Hybrid"] }, "TRD Off-Road": { engines: ["2.5L I4"] }, "Prime SE": { engines: ["Plug-In Hybrid"] }, "Prime XSE": { engines: ["Plug-In Hybrid"] } } },
      Venza: { trims: { LE: { engines: ["Hybrid"] }, XLE: { engines: ["Hybrid"] }, Limited: { engines: ["Hybrid"] } } },
      Highlander: { trims: { L: { engines: ["3.5L V6"] }, LE: { engines: ["3.5L V6", "Hybrid"] }, XLE: { engines: ["3.5L V6", "Hybrid"] }, Limited: { engines: ["3.5L V6", "Hybrid"] }, Platinum: { engines: ["3.5L V6", "Hybrid"] } } },
      "4Runner": { trims: { SR5: { engines: ["4.0L V6"] }, "TRD Off-Road": { engines: ["4.0L V6"] }, Limited: { engines: ["4.0L V6"] }, "TRD Pro": { engines: ["4.0L V6", "Turbo Hybrid"] } } },
      Sequoia: { trims: { SR5: { engines: ["Hybrid"] }, Limited: { engines: ["Hybrid"] }, Platinum: { engines: ["Hybrid"] }, "TRD Pro": { engines: ["Hybrid"] } } },
      Tacoma: { trims: { SR: { engines: ["2.4L Turbo"] }, SR5: { engines: ["2.4L Turbo"] }, "TRD Sport": { engines: ["2.4L Turbo", "2.4L Turbo Hybrid"] }, "TRD Off-Road": { engines: ["2.4L Turbo", "2.4L Turbo Hybrid"] }, Limited: { engines: ["2.4L Turbo Hybrid"] }, "TRD Pro": { engines: ["2.4L Turbo Hybrid"] } } },
      Tundra: { trims: { SR: { engines: ["3.5L Twin Turbo V6"] }, SR5: { engines: ["3.5L Twin Turbo V6"] }, Limited: { engines: ["3.5L Twin Turbo V6", "Hybrid"] }, Platinum: { engines: ["3.5L Twin Turbo V6", "Hybrid"] }, "1794 Edition": { engines: ["Hybrid"] }, TRDPro: { engines: ["Hybrid"] } } },
      Sienna: { trims: { LE: { engines: ["Hybrid"] }, XLE: { engines: ["Hybrid"] }, XSE: { engines: ["Hybrid"] }, Limited: { engines: ["Hybrid"] }, Platinum: { engines: ["Hybrid"] } } },
      Avalon: { trims: { XLE: { engines: ["3.5L V6"] }, Limited: { engines: ["3.5L V6"] }, Touring: { engines: ["3.5L V6"] }, TRD: { engines: ["3.5L V6"] } } },
    },
  },
  Ford: {
    models: {
      Focus: { trims: { S: { engines: ["2.0L I4"] }, SE: { engines: ["2.0L I4"] }, SEL: { engines: ["2.0L I4"] }, Titanium: { engines: ["2.0L I4"] }, ST: { engines: ["2.3L EcoBoost"] } } },
      Fusion: { trims: { S: { engines: ["2.5L I4"] }, SE: { engines: ["1.5L EcoBoost", "Hybrid"] }, SEL: { engines: ["1.5L EcoBoost", "Hybrid"] }, Titanium: { engines: ["2.0L EcoBoost"] } } },
      Escape: { trims: { S: { engines: ["1.5L EcoBoost"] }, SE: { engines: ["1.5L EcoBoost", "Hybrid"] }, SEL: { engines: ["1.5L EcoBoost", "Hybrid", "Plug-In Hybrid"] }, Titanium: { engines: ["2.0L EcoBoost", "Hybrid", "Plug-In Hybrid"] }, "ST-Line": { engines: ["2.0L EcoBoost"] } } },
      Edge: { trims: { SE: { engines: ["2.0L EcoBoost"] }, SEL: { engines: ["2.0L EcoBoost"] }, Titanium: { engines: ["2.0L EcoBoost"] }, ST: { engines: ["2.7L EcoBoost"] } } },
      Explorer: { trims: { Base: { engines: ["2.3L EcoBoost"] }, XLT: { engines: ["2.3L EcoBoost"] }, Limited: { engines: ["2.3L EcoBoost", "3.0L EcoBoost Hybrid"] }, ST: { engines: ["3.0L EcoBoost"] }, Platinum: { engines: ["3.0L EcoBoost"] } } },
      Expedition: { trims: { XL: { engines: ["3.5L EcoBoost"] }, XLT: { engines: ["3.5L EcoBoost"] }, Limited: { engines: ["3.5L EcoBoost"] }, Platinum: { engines: ["3.5L EcoBoost"] }, "King Ranch": { engines: ["3.5L EcoBoost"] } } },
      Bronco: { trims: { Base: { engines: ["2.3L EcoBoost"] }, "Big Bend": { engines: ["2.3L EcoBoost"] }, "Black Diamond": { engines: ["2.3L EcoBoost", "2.7L EcoBoost"] }, "Outer Banks": { engines: ["2.3L EcoBoost", "2.7L EcoBoost"] }, Badlands: { engines: ["2.3L EcoBoost", "2.7L EcoBoost"] }, Raptor: { engines: ["3.0L Twin Turbo V6"] } } },
      "Bronco Sport": { trims: { Base: { engines: ["1.5L EcoBoost"] }, "Big Bend": { engines: ["1.5L EcoBoost"] }, "Outer Banks": { engines: ["1.5L EcoBoost", "2.0L EcoBoost"] }, Badlands: { engines: ["2.0L EcoBoost"] } } },
      Maverick: { trims: { XL: { engines: ["Hybrid"] }, XLT: { engines: ["Hybrid", "2.0L EcoBoost"] }, Lariat: { engines: ["Hybrid", "2.0L EcoBoost"] }, Tremor: { engines: ["2.0L EcoBoost"] } } },
      Ranger: { trims: { XL: { engines: ["2.3L EcoBoost"] }, XLT: { engines: ["2.3L EcoBoost"] }, Lariat: { engines: ["2.3L EcoBoost", "2.7L EcoBoost"] }, Raptor: { engines: ["3.0L Twin Turbo V6"] } } },
      "F-150": { trims: { XL: { engines: ["3.3L V6", "2.7L EcoBoost"] }, XLT: { engines: ["2.7L EcoBoost", "5.0L V8"] }, Lariat: { engines: ["2.7L EcoBoost", "5.0L V8", "PowerBoost Hybrid"] }, "King Ranch": { engines: ["5.0L V8", "PowerBoost Hybrid"] }, Platinum: { engines: ["3.5L EcoBoost", "PowerBoost Hybrid"] }, Limited: { engines: ["3.5L Twin Turbo V6"] }, Raptor: { engines: ["3.5L Twin Turbo V6"] } } },
      Mustang: { trims: { EcoBoost: { engines: ["2.3L EcoBoost"] }, GT: { engines: ["5.0L V8"] }, "Dark Horse": { engines: ["5.0L V8"] }, "Shelby GT500": { engines: ["5.2L Supercharged V8"] } } },
      "Mustang Mach-E": { trims: { Select: { engines: ["Electric"] }, Premium: { engines: ["Electric"] }, "California Route1": { engines: ["Electric"] }, GT: { engines: ["Electric"] } } },
    },
  },
  Chevrolet: {
    models: {
      Malibu: { trims: { LS: { engines: ["1.5L Turbo"] }, RS: { engines: ["1.5L Turbo"] }, LT: { engines: ["1.5L Turbo"] }, Premier: { engines: ["2.0L Turbo"] } } },
      Trax: { trims: { LS: { engines: ["1.2L Turbo"] }, LT: { engines: ["1.2L Turbo"] }, Activ: { engines: ["1.2L Turbo"] }, RS: { engines: ["1.2L Turbo"] } } },
      Trailblazer: { trims: { LS: { engines: ["1.2L Turbo"] }, LT: { engines: ["1.2L Turbo", "1.3L Turbo"] }, Activ: { engines: ["1.3L Turbo"] }, RS: { engines: ["1.3L Turbo"] } } },
      Equinox: { trims: { LS: { engines: ["1.5L Turbo"] }, LT: { engines: ["1.5L Turbo"] }, RS: { engines: ["1.5L Turbo"] }, Premier: { engines: ["1.5L Turbo"] } } },
      Blazer: { trims: { LT: { engines: ["2.0L Turbo", "3.6L V6"] }, RS: { engines: ["3.6L V6"] }, Premier: { engines: ["3.6L V6"] } } },
      Traverse: { trims: { LS: { engines: ["2.5L I4"] }, LT: { engines: ["2.5L I4", "3.6L V6"] }, RS: { engines: ["2.0L Turbo"] }, Premier: { engines: ["3.6L V6"] }, "High Country": { engines: ["3.6L V6"] } } },
      Tahoe: { trims: { LS: { engines: ["5.3L V8"] }, LT: { engines: ["5.3L V8"] }, RST: { engines: ["6.2L V8"] }, Premier: { engines: ["5.3L V8", "3.0L Duramax Diesel"] }, "High Country": { engines: ["6.2L V8"] } } },
      Suburban: { trims: { LS: { engines: ["5.3L V8"] }, LT: { engines: ["5.3L V8"] }, Premier: { engines: ["5.3L V8", "3.0L Duramax Diesel"] }, "High Country": { engines: ["6.2L V8"] } } },
      Colorado: { trims: { WT: { engines: ["2.7L Turbo"] }, LT: { engines: ["2.7L Turbo"] }, "Trail Boss": { engines: ["2.7L Turbo"] }, Z71: { engines: ["2.7L Turbo"] }, ZR2: { engines: ["2.7L Turbo"] } } },
      Silverado: { trims: { WT: { engines: ["2.7L Turbo", "5.3L V8"] }, Custom: { engines: ["2.7L Turbo", "5.3L V8"] }, LT: { engines: ["2.7L Turbo", "5.3L V8"] }, RST: { engines: ["5.3L V8", "6.2L V8"] }, LTZ: { engines: ["5.3L V8", "3.0L Duramax Diesel"] }, "High Country": { engines: ["6.2L V8", "3.0L Duramax Diesel"] } } },
      Camaro: { trims: { "1LS": { engines: ["2.0L Turbo"] }, "1LT": { engines: ["2.0L Turbo", "3.6L V6"] }, "2SS": { engines: ["6.2L V8"] }, ZL1: { engines: ["6.2L Supercharged V8"] } } },
      Corvette: { trims: { "1LT": { engines: ["6.2L V8"] }, "2LT": { engines: ["6.2L V8"] }, "3LT": { engines: ["6.2L V8"] }, Z06: { engines: ["5.5L V8"] } } },
      "Bolt EV": { trims: { LT: { engines: ["Electric"] }, Premier: { engines: ["Electric"] } } },
    },
  },
  Honda: {
    models: {
      Civic: { trims: { LX: { engines: ["2.0L I4"] }, Sport: { engines: ["2.0L I4"] }, EX: { engines: ["1.5L Turbo"] }, Touring: { engines: ["1.5L Turbo"] }, Si: { engines: ["1.5L Turbo"] }, "Type R": { engines: ["2.0L Turbo"] } } },
      Accord: { trims: { LX: { engines: ["1.5L Turbo"] }, Sport: { engines: ["1.5L Turbo", "2.0L Turbo"] }, "EX-L": { engines: ["1.5L Turbo", "Hybrid"] }, "Sport L": { engines: ["Hybrid"] }, Touring: { engines: ["2.0L Turbo", "Hybrid"] } } },
      Insight: { trims: { LX: { engines: ["Hybrid"] }, EX: { engines: ["Hybrid"] }, Touring: { engines: ["Hybrid"] } } },
      "HR-V": { trims: { LX: { engines: ["2.0L I4"] }, Sport: { engines: ["2.0L I4"] }, "EX-L": { engines: ["2.0L I4"] } } },
      "CR-V": { trims: { LX: { engines: ["1.5L Turbo"] }, EX: { engines: ["1.5L Turbo", "Hybrid"] }, "EX-L": { engines: ["1.5L Turbo", "Hybrid"] }, Sport: { engines: ["Hybrid"] }, "Sport-L": { engines: ["Hybrid"] }, "Sport Touring": { engines: ["1.5L Turbo", "Hybrid"] } } },
      Passport: { trims: { "EX L": { engines: ["3.5L V6"] }, TrailSport: { engines: ["3.5L V6"] }, Elite: { engines: ["3.5L V6"] } } },
      Pilot: { trims: { Sport: { engines: ["3.5L V6"] }, "EX L": { engines: ["3.5L V6"] }, TrailSport: { engines: ["3.5L V6"] }, Touring: { engines: ["3.5L V6"] }, Elite: { engines: ["3.5L V6"] } } },
      Odyssey: { trims: { EX: { engines: ["3.5L V6"] }, "EX L": { engines: ["3.5L V6"] }, Touring: { engines: ["3.5L V6"] }, Elite: { engines: ["3.5L V6"] } } },
      Ridgeline: { trims: { Sport: { engines: ["3.5L V6"] }, RTL: { engines: ["3.5L V6"] }, TrailSport: { engines: ["3.5L V6"] }, "Black Edition": { engines: ["3.5L V6"] } } },
    },
  },
  Nissan: {
    models: {
      Versa: { trims: { S: { engines: ["1.6L I4"] }, SV: { engines: ["1.6L I4"] }, SR: { engines: ["1.6L I4"] } } },
      Sentra: { trims: { S: { engines: ["2.0L I4"] }, SV: { engines: ["2.0L I4"] }, SR: { engines: ["2.0L I4"] } } },
      Altima: { trims: { S: { engines: ["2.5L I4"] }, SV: { engines: ["2.5L I4"] }, SR: { engines: ["2.5L I4", "2.0L VC-Turbo"] }, SL: { engines: ["2.5L I4"] }, Platinum: { engines: ["2.5L I4"] } } },
      Maxima: { trims: { SV: { engines: ["3.5L V6"] }, SR: { engines: ["3.5L V6"] }, SL: { engines: ["3.5L V6"] }, Platinum: { engines: ["3.5L V6"] } } },
      Kicks: { trims: { S: { engines: ["1.6L I4"] }, SV: { engines: ["1.6L I4"] }, SR: { engines: ["1.6L I4"] } } },
      Rogue: { trims: { S: { engines: ["1.5L VC-Turbo"] }, SV: { engines: ["1.5L VC-Turbo"] }, SL: { engines: ["1.5L VC-Turbo"] }, Platinum: { engines: ["1.5L VC-Turbo"] } } },
      Murano: { trims: { S: { engines: ["3.5L V6"] }, SV: { engines: ["3.5L V6"] }, SL: { engines: ["3.5L V6"] }, Platinum: { engines: ["3.5L V6"] } } },
      Pathfinder: { trims: { S: { engines: ["3.5L V6"] }, SV: { engines: ["3.5L V6"] }, SL: { engines: ["3.5L V6"] }, Platinum: { engines: ["3.5L V6"] } } },
      Armada: { trims: { S: { engines: ["5.6L V8"] }, SV: { engines: ["5.6L V8"] }, SL: { engines: ["5.6L V8"] }, Platinum: { engines: ["5.6L V8"] } } },
      Frontier: { trims: { S: { engines: ["3.8L V6"] }, SV: { engines: ["3.8L V6"] }, "PRO 4X": { engines: ["3.8L V6"] }, SL: { engines: ["3.8L V6"] } } },
      Titan: { trims: { S: { engines: ["5.6L V8"] }, SV: { engines: ["5.6L V8"] }, "PRO 4X": { engines: ["5.6L V8"] }, Platinum: { engines: ["5.6L V8"] } } },
      Z: { trims: { Sport: { engines: ["3.0L Twin Turbo V6"] }, Performance: { engines: ["3.0L Twin Turbo V6"] }, "Nismo": { engines: ["3.0L Twin Turbo V6"] } } },
    },
  },
  Hyundai: {
    models: {
      Accent: { trims: { SE: { engines: ["1.6L I4"] }, SEL: { engines: ["1.6L I4"] } } },
      Elantra: { trims: { SE: { engines: ["2.0L I4"] }, SEL: { engines: ["2.0L I4"] }, "N Line": { engines: ["1.6L Turbo"] }, Limited: { engines: ["2.0L I4", "Hybrid"] }, N: { engines: ["2.0L Turbo"] } } },
      Sonata: { trims: { SE: { engines: ["2.5L I4"] }, SEL: { engines: ["2.5L I4"] }, "N Line": { engines: ["2.5L Turbo"] }, Limited: { engines: ["2.5L I4", "Hybrid"] } } },
      Venue: { trims: { SE: { engines: ["1.6L I4"] }, SEL: { engines: ["1.6L I4"] }, Denim: { engines: ["1.6L I4"] }, Limited: { engines: ["1.6L I4"] } } },
      Kona: { trims: { SE: { engines: ["2.0L I4"] }, SEL: { engines: ["2.0L I4"] }, "N Line": { engines: ["1.6L Turbo"] }, Limited: { engines: ["1.6L Turbo"] }, N: { engines: ["2.0L Turbo"] }, Electric: { engines: ["Electric"] } } },
      Tucson: { trims: { SE: { engines: ["2.5L I4"] }, SEL: { engines: ["2.5L I4", "Hybrid"] }, "N Line": { engines: ["1.6L Turbo Hybrid"] }, Limited: { engines: ["2.5L I4", "Hybrid", "Plug-In Hybrid"] } } },
      "Santa Fe": { trims: { SE: { engines: ["2.5L I4"] }, SEL: { engines: ["2.5L I4"] }, XRT: { engines: ["2.5L Turbo"] }, Calligraphy: { engines: ["2.5L Turbo", "Hybrid"] } } },
      Palisade: { trims: { SE: { engines: ["3.8L V6"] }, SEL: { engines: ["3.8L V6"] }, XRT: { engines: ["3.8L V6"] }, Limited: { engines: ["3.8L V6"] }, Calligraphy: { engines: ["3.8L V6"] } } },
      "Ioniq 5": { trims: { SE: { engines: ["Electric"] }, SEL: { engines: ["Electric"] }, Limited: { engines: ["Electric"] }, N: { engines: ["Electric"] } } },
      "Ioniq 6": { trims: { SE: { engines: ["Electric"] }, SEL: { engines: ["Electric"] }, Limited: { engines: ["Electric"] } } },
    },
  },
  Kia: {
    models: {
      Rio: { trims: { LX: { engines: ["1.6L I4"] }, S: { engines: ["1.6L I4"] } } },
      Forte: { trims: { FE: { engines: ["2.0L I4"] }, LXS: { engines: ["2.0L I4"] }, "GT Line": { engines: ["2.0L I4"] }, GT: { engines: ["1.6L Turbo"] } } },
      K5: { trims: { LXS: { engines: ["1.6L Turbo"] }, "GT Line": { engines: ["1.6L Turbo"] }, EX: { engines: ["2.5L I4"] }, GT: { engines: ["2.5L Turbo"] } } },
      Stinger: { trims: { "GT Line": { engines: ["2.5L Turbo"] }, GT1: { engines: ["3.3L Twin Turbo V6"] }, GT2: { engines: ["3.3L Twin Turbo V6"] } } },
      Soul: { trims: { LX: { engines: ["2.0L I4"] }, S: { engines: ["2.0L I4"] }, "GT Line": { engines: ["2.0L I4"] }, EX: { engines: ["2.0L I4"] } } },
      Seltos: { trims: { LX: { engines: ["2.0L I4"] }, S: { engines: ["2.0L I4"] }, EX: { engines: ["1.6L Turbo"] }, SX: { engines: ["1.6L Turbo"] } } },
      Niro: { trims: { LX: { engines: ["Hybrid"] }, EX: { engines: ["Hybrid", "Plug-In Hybrid"] }, "SX Touring": { engines: ["Hybrid", "Plug-In Hybrid"] }, "EV Wind": { engines: ["Electric"] }, "EV Wave": { engines: ["Electric"] } } },
      Sportage: { trims: { LX: { engines: ["2.5L I4"] }, EX: { engines: ["2.5L I4", "Hybrid"] }, "X Line": { engines: ["1.6L Turbo Hybrid"] }, "X Pro": { engines: ["2.5L I4"] } } },
      Sorento: { trims: { LX: { engines: ["2.5L I4"] }, S: { engines: ["2.5L I4"] }, EX: { engines: ["2.5L Turbo", "Hybrid"] }, SX: { engines: ["2.5L Turbo", "Plug-In Hybrid"] }, "SX Prestige": { engines: ["2.5L Turbo"] } } },
      Telluride: { trims: { LX: { engines: ["3.8L V6"] }, S: { engines: ["3.8L V6"] }, EX: { engines: ["3.8L V6"] }, SX: { engines: ["3.8L V6"] }, "SX Prestige": { engines: ["3.8L V6"] } } },
      Carnival: { trims: { LX: { engines: ["3.5L V6"] }, EX: { engines: ["3.5L V6"] }, SX: { engines: ["3.5L V6"] }, "SX Prestige": { engines: ["3.5L V6"] } } },
      EV6: { trims: { Light: { engines: ["Electric"] }, Wind: { engines: ["Electric"] }, "GT Line": { engines: ["Electric"] }, GT: { engines: ["Electric"] } } },
    },
  },
  Mercedes: {
    models: {
      "A 220": { trims: { Base: { engines: ["2.0L Turbo"] }, "AMG Line": { engines: ["2.0L Turbo"] } } },
      "C 300": { trims: { Base: { engines: ["2.0L Turbo"] }, "AMG Line": { engines: ["2.0L Turbo"] }, "AMG C 43": { engines: ["2.0L Turbo Hybrid"] } } },
      "E 350": { trims: { Base: { engines: ["2.0L Turbo"] }, "AMG Line": { engines: ["2.0L Turbo"] }, "E 450": { engines: ["3.0L I6"] } } },
      "S 500": { trims: { Base: { engines: ["3.0L I6"] }, "S 580": { engines: ["4.0L V8"] } } },
      GLA: { trims: { "GLA 250": { engines: ["2.0L Turbo"] }, "AMG GLA 35": { engines: ["2.0L Turbo"] } } },
      GLB: { trims: { "GLB 250": { engines: ["2.0L Turbo"] }, "AMG GLB 35": { engines: ["2.0L Turbo"] } } },
      "GLC 300": { trims: { Base: { engines: ["2.0L Turbo"] }, "AMG Line": { engines: ["2.0L Turbo"] }, "AMG GLC 43": { engines: ["2.0L Turbo"] } } },
      "GLE 350": { trims: { Base: { engines: ["2.0L Turbo"] }, "GLE 450": { engines: ["3.0L I6"] }, "AMG GLE 53": { engines: ["3.0L Turbo I6"] } } },
      GLS: { trims: { "GLS 450": { engines: ["3.0L I6"] }, "GLS 580": { engines: ["4.0L V8"] }, "AMG GLS 63": { engines: ["4.0L V8"] } } },
      "G-Class": { trims: { "G 550": { engines: ["4.0L V8"] }, "AMG G 63": { engines: ["4.0L V8"] } } },
    },
  },
  Lexus: {
    models: {
      UX: { trims: { "UX 200": { engines: ["2.0L I4"] }, "UX 250h": { engines: ["Hybrid"] } } },
      "IS 300": { trims: { Base: { engines: ["2.0L Turbo"] }, "F Sport": { engines: ["2.0L Turbo", "3.5L V6"] } } },
      "IS 350": { trims: { Base: { engines: ["3.5L V6"] }, "F Sport": { engines: ["3.5L V6"] } } },
      "ES 350": { trims: { Base: { engines: ["3.5L V6"] }, "F Sport": { engines: ["3.5L V6"] }, "Ultra Luxury": { engines: ["3.5L V6"] }, "ES 300h": { engines: ["Hybrid"] } } },
      NX: { trims: { "NX 250": { engines: ["2.5L I4"] }, "NX 350": { engines: ["2.4L Turbo"] }, "NX 350h": { engines: ["Hybrid"] }, "NX 450h": { engines: ["Plug-In Hybrid"] } } },
      "RX 350": { trims: { Base: { engines: ["2.4L Turbo"] }, Premium: { engines: ["2.4L Turbo"] }, "F Sport": { engines: ["2.4L Turbo"] }, Luxury: { engines: ["2.4L Turbo"] } } },
      "RX 350L": { trims: { Premium: { engines: ["2.4L Turbo"] }, Luxury: { engines: ["2.4L Turbo"] } } },
      "GX 460": { trims: { Base: { engines: ["4.6L V8"] }, Premium: { engines: ["4.6L V8"] }, Luxury: { engines: ["4.6L V8"] } } },
      "LX 600": { trims: { Base: { engines: ["3.4L Twin Turbo V6"] }, Premium: { engines: ["3.4L Twin Turbo V6"] }, "Ultra Luxury": { engines: ["3.4L Twin Turbo V6"] } } },
      TX: { trims: { "TX 350": { engines: ["2.4L Turbo"] }, "TX 500h": { engines: ["Hybrid"] }, "TX 550h": { engines: ["Plug-In Hybrid"] } } },
    },
  },
  Mazda: {
    models: {
      Mazda3: { trims: { "2.5 S": { engines: ["2.5L I4"] }, "2.5 S Select": { engines: ["2.5L I4"] }, "2.5 S Preferred": { engines: ["2.5L I4"] }, "2.5 Turbo": { engines: ["2.5L Turbo"] } } },
      Mazda6: { trims: { Sport: { engines: ["2.5L I4"] }, Touring: { engines: ["2.5L I4"] }, "Grand Touring": { engines: ["2.5L Turbo"] }, Signature: { engines: ["2.5L Turbo"] } } },
      "MX-5 Miata": { trims: { Sport: { engines: ["2.0L I4"] }, Club: { engines: ["2.0L I4"] }, "Grand Touring": { engines: ["2.0L I4"] } } },
      "CX-30": { trims: { "2.5 S": { engines: ["2.5L I4"] }, "2.5 S Select": { engines: ["2.5L I4"] }, "2.5 S Preferred": { engines: ["2.5L I4"] }, Turbo: { engines: ["2.5L Turbo"] } } },
      "CX-5": { trims: { S: { engines: ["2.5L I4"] }, Select: { engines: ["2.5L I4"] }, Preferred: { engines: ["2.5L I4", "2.5L Turbo"] }, "Turbo Signature": { engines: ["2.5L Turbo"] } } },
      "CX-50": { trims: { S: { engines: ["2.5L I4"] }, Select: { engines: ["2.5L I4"] }, Preferred: { engines: ["2.5L I4", "2.5L Turbo"] }, Meridian: { engines: ["2.5L Turbo"] } } },
      "CX-90": { trims: { Select: { engines: ["3.3L Turbo I6"] }, Preferred: { engines: ["3.3L Turbo I6", "Plug-In Hybrid"] }, "Premium Plus": { engines: ["3.3L Turbo I6"] } } },
    },
  },
  Volkswagen: {
    models: {
      Jetta: { trims: { S: { engines: ["1.5L Turbo"] }, SE: { engines: ["1.5L Turbo"] }, SEL: { engines: ["1.5L Turbo"] }, GLI: { engines: ["2.0L Turbo"] } } },
      Passat: { trims: { S: { engines: ["1.4L Turbo"] }, SE: { engines: ["1.4L Turbo"] }, "R Line": { engines: ["2.0L Turbo"] } } },
      Golf: { trims: { S: { engines: ["1.4L Turbo"] }, SE: { engines: ["1.4L Turbo"] }, GTI: { engines: ["2.0L Turbo"] }, R: { engines: ["2.0L Turbo"] } } },
      Taos: { trims: { S: { engines: ["1.5L Turbo"] }, SE: { engines: ["1.5L Turbo"] }, SEL: { engines: ["1.5L Turbo"] } } },
      Tiguan: { trims: { S: { engines: ["2.0L Turbo"] }, SE: { engines: ["2.0L Turbo"] }, SEL: { engines: ["2.0L Turbo"] }, "SEL R-Line": { engines: ["2.0L Turbo"] } } },
      Atlas: { trims: { S: { engines: ["2.0L Turbo"] }, SE: { engines: ["2.0L Turbo", "3.6L V6"] }, SEL: { engines: ["3.6L V6"] }, "SEL Premium": { engines: ["3.6L V6"] } } },
      "ID.4": { trims: { Standard: { engines: ["Electric"] }, Pro: { engines: ["Electric"] }, "Pro S": { engines: ["Electric"] }, "AWD Pro": { engines: ["Electric"] } } },
    },
  },
  Subaru: {
    models: {
      Impreza: { trims: { Base: { engines: ["2.0L Boxer"] }, Premium: { engines: ["2.0L Boxer"] }, Sport: { engines: ["2.5L Boxer"] }, Limited: { engines: ["2.5L Boxer"] }, RS: { engines: ["2.5L Boxer"] } } },
      Legacy: { trims: { Base: { engines: ["2.5L Boxer"] }, Premium: { engines: ["2.5L Boxer"] }, Sport: { engines: ["2.4L Turbo Boxer"] }, Limited: { engines: ["2.5L Boxer"] }, Touring: { engines: ["2.4L Turbo Boxer"] } } },
      BRZ: { trims: { Premium: { engines: ["2.4L Boxer"] }, Limited: { engines: ["2.4L Boxer"] }, tS: { engines: ["2.4L Boxer"] } } },
      Crosstrek: { trims: { Base: { engines: ["2.0L Boxer"] }, Premium: { engines: ["2.0L Boxer"] }, Sport: { engines: ["2.5L Boxer"] }, Limited: { engines: ["2.5L Boxer"] }, Wilderness: { engines: ["2.5L Boxer"] } } },
      Forester: { trims: { Base: { engines: ["2.5L Boxer"] }, Premium: { engines: ["2.5L Boxer"] }, Sport: { engines: ["2.5L Boxer"] }, Limited: { engines: ["2.5L Boxer"] }, Wilderness: { engines: ["2.5L Boxer"] }, Touring: { engines: ["2.5L Boxer"] } } },
      Outback: { trims: { Base: { engines: ["2.5L Boxer"] }, Premium: { engines: ["2.5L Boxer"] }, Onyx: { engines: ["2.4L Turbo Boxer"] }, Limited: { engines: ["2.5L Boxer"] }, Wilderness: { engines: ["2.4L Turbo Boxer"] }, Touring: { engines: ["2.4L Turbo Boxer"] } } },
      Ascent: { trims: { Base: { engines: ["2.4L Turbo Boxer"] }, Premium: { engines: ["2.4L Turbo Boxer"] }, Onyx: { engines: ["2.4L Turbo Boxer"] }, Limited: { engines: ["2.4L Turbo Boxer"] }, Touring: { engines: ["2.4L Turbo Boxer"] } } },
      WRX: { trims: { Base: { engines: ["2.4L Turbo Boxer"] }, Premium: { engines: ["2.4L Turbo Boxer"] }, Limited: { engines: ["2.4L Turbo Boxer"] }, TR: { engines: ["2.4L Turbo Boxer"] }, STI: { engines: ["2.5L Turbo Boxer"] } } },
      Solterra: { trims: { Premium: { engines: ["Electric"] }, Limited: { engines: ["Electric"] }, Touring: { engines: ["Electric"] } } },
    },
  },
  Jeep: {
    models: {
      Renegade: { trims: { Sport: { engines: ["1.3L Turbo"] }, Latitude: { engines: ["1.3L Turbo"] }, Limited: { engines: ["1.3L Turbo"] }, Trailhawk: { engines: ["1.3L Turbo"] } } },
      Compass: { trims: { Sport: { engines: ["2.0L I4"] }, Latitude: { engines: ["2.0L I4"] }, Limited: { engines: ["2.0L I4"] }, Trailhawk: { engines: ["2.0L I4"] } } },
      Cherokee: { trims: { Latitude: { engines: ["2.4L I4"] }, Limited: { engines: ["3.2L V6"] }, Trailhawk: { engines: ["3.2L V6"] } } },
      "Grand Cherokee": { trims: { Laredo: { engines: ["3.6L V6"] }, Limited: { engines: ["3.6L V6"] }, Trailhawk: { engines: ["3.6L V6"] }, Overland: { engines: ["3.6L V6", "5.7L V8"] }, Summit: { engines: ["5.7L V8"] }, "4xe": { engines: ["Plug-In Hybrid"] } } },
      Wrangler: { trims: { Sport: { engines: ["3.6L V6"] }, Sahara: { engines: ["3.6L V6", "Plug-In Hybrid"] }, Rubicon: { engines: ["3.6L V6", "Plug-In Hybrid"] }, "392": { engines: ["6.4L V8"] } } },
      Gladiator: { trims: { Sport: { engines: ["3.6L V6"] }, Willys: { engines: ["3.6L V6"] }, Rubicon: { engines: ["3.6L V6"] }, Mojave: { engines: ["3.6L V6"] } } },
    },
  },
  Dodge: {
    models: {
      Charger: { trims: { SXT: { engines: ["3.6L V6"] }, GT: { engines: ["3.6L V6"] }, "R/T": { engines: ["5.7L V8"] }, "Scat Pack": { engines: ["6.4L V8"] }, "SRT Hellcat": { engines: ["6.2L Supercharged V8"] } } },
      Challenger: { trims: { SXT: { engines: ["3.6L V6"] }, GT: { engines: ["3.6L V6"] }, "R/T": { engines: ["5.7L V8"] }, "Scat Pack": { engines: ["6.4L V8"] }, "SRT Hellcat": { engines: ["6.2L Supercharged V8"] } } },
      Durango: { trims: { GT: { engines: ["3.6L V6"] }, "R/T": { engines: ["5.7L V8"] }, Citadel: { engines: ["5.7L V8"] }, SRT: { engines: ["6.4L V8"] } } },
      Journey: { trims: { SE: { engines: ["2.4L I4"] }, SXT: { engines: ["2.4L I4", "3.6L V6"] }, Crossroad: { engines: ["3.6L V6"] } } },
      Hornet: { trims: { GT: { engines: ["1.3L Turbo"] }, "R/T": { engines: ["Plug-In Hybrid"] }, "R/T Plus": { engines: ["Plug-In Hybrid"] } } },
    },
  },
  Buick: {
    models: {
      Encore: { trims: { Base: { engines: ["1.4L Turbo"] }, Preferred: { engines: ["1.4L Turbo"] }, Essence: { engines: ["1.4L Turbo"] } } },
      "Encore GX": { trims: { Preferred: { engines: ["1.2L Turbo"] }, Select: { engines: ["1.2L Turbo"] }, Essence: { engines: ["1.3L Turbo"] }, Avenir: { engines: ["1.3L Turbo"] } } },
      Envision: { trims: { Preferred: { engines: ["2.0L Turbo"] }, Essence: { engines: ["2.0L Turbo"] }, Avenir: { engines: ["2.0L Turbo"] } } },
      Enclave: { trims: { Essence: { engines: ["3.6L V6"] }, Premium: { engines: ["3.6L V6"] }, Avenir: { engines: ["3.6L V6"] } } },
    },
  },
  Cadillac: {
    models: {
      CT4: { trims: { Luxury: { engines: ["2.0L Turbo"] }, "Premium Luxury": { engines: ["2.0L Turbo"] }, Sport: { engines: ["2.0L Turbo"] }, "V-Series Blackwing": { engines: ["3.6L Twin Turbo V6"] } } },
      CT5: { trims: { Luxury: { engines: ["2.0L Turbo"] }, "Premium Luxury": { engines: ["2.0L Turbo", "3.0L Twin Turbo V6"] }, Sport: { engines: ["2.0L Turbo", "3.0L Twin Turbo V6"] }, "V-Series Blackwing": { engines: ["6.2L Supercharged V8"] } } },
      XT4: { trims: { Luxury: { engines: ["2.0L Turbo"] }, "Premium Luxury": { engines: ["2.0L Turbo"] }, Sport: { engines: ["2.0L Turbo"] } } },
      XT5: { trims: { Luxury: { engines: ["2.0L Turbo"] }, "Premium Luxury": { engines: ["3.6L V6"] }, Sport: { engines: ["3.6L V6"] } } },
      XT6: { trims: { Luxury: { engines: ["3.6L V6"] }, "Premium Luxury": { engines: ["3.6L V6"] }, Sport: { engines: ["3.6L V6"] } } },
      Escalade: { trims: { Luxury: { engines: ["6.2L V8", "3.0L Duramax Diesel"] }, "Premium Luxury": { engines: ["6.2L V8", "3.0L Duramax Diesel"] }, Sport: { engines: ["6.2L V8"] }, Platinum: { engines: ["6.2L V8"] } } },
      Lyriq: { trims: { Tech: { engines: ["Electric"] }, Luxury: { engines: ["Electric"] }, Sport: { engines: ["Electric"] } } },
    },
  },
  Chrysler: {
    models: {
      "300": { trims: { Touring: { engines: ["3.6L V6"] }, Limited: { engines: ["3.6L V6"] }, "300S": { engines: ["3.6L V6", "5.7L V8"] }, "300C": { engines: ["5.7L V8"] } } },
      Pacifica: { trims: { Touring: { engines: ["3.6L V6"] }, "Touring L": { engines: ["3.6L V6"] }, Limited: { engines: ["3.6L V6"] }, Pinnacle: { engines: ["3.6L V6"] }, "Hybrid Touring L": { engines: ["Plug-In Hybrid"] } } },
      Voyager: { trims: { LX: { engines: ["3.6L V6"] } } },
    },
  },
  Lincoln: {
    models: {
      Corsair: { trims: { Standard: { engines: ["2.0L Turbo"] }, Reserve: { engines: ["2.0L Turbo", "2.3L Turbo"] }, "Grand Touring": { engines: ["Plug-In Hybrid"] }, "Black Label": { engines: ["2.3L Turbo"] } } },
      Nautilus: { trims: { Standard: { engines: ["2.0L Turbo"] }, Reserve: { engines: ["2.0L Turbo", "Hybrid"] }, "Black Label": { engines: ["2.0L Turbo"] } } },
      Aviator: { trims: { Standard: { engines: ["3.0L Twin Turbo V6"] }, Reserve: { engines: ["3.0L Twin Turbo V6", "Plug-In Hybrid"] }, "Black Label": { engines: ["3.0L Twin Turbo V6", "Plug-In Hybrid"] } } },
      Navigator: { trims: { Standard: { engines: ["3.5L Twin Turbo V6"] }, Reserve: { engines: ["3.5L Twin Turbo V6"] }, "Black Label": { engines: ["3.5L Twin Turbo V6"] } } },
    },
  },
  GMC: {
    models: {
      Terrain: { trims: { SLE: { engines: ["1.5L Turbo"] }, SLT: { engines: ["1.5L Turbo"] }, AT4: { engines: ["2.0L Turbo"] }, Denali: { engines: ["2.0L Turbo"] } } },
      Acadia: { trims: { SLE: { engines: ["2.0L Turbo"] }, SLT: { engines: ["2.0L Turbo"] }, AT4: { engines: ["2.0L Turbo"] }, Denali: { engines: ["2.0L Turbo"] } } },
      Yukon: { trims: { SLE: { engines: ["5.3L V8"] }, SLT: { engines: ["5.3L V8"] }, AT4: { engines: ["6.2L V8"] }, Denali: { engines: ["6.2L V8", "3.0L Duramax Diesel"] } } },
      "Yukon XL": { trims: { SLE: { engines: ["5.3L V8"] }, SLT: { engines: ["5.3L V8"] }, AT4: { engines: ["6.2L V8"] }, Denali: { engines: ["6.2L V8", "3.0L Duramax Diesel"] } } },
      "Sierra 1500": { trims: { Pro: { engines: ["2.7L Turbo"] }, SLE: { engines: ["2.7L Turbo", "5.3L V8"] }, Elevation: { engines: ["5.3L V8"] }, SLT: { engines: ["5.3L V8"] }, AT4: { engines: ["6.2L V8", "3.0L Duramax Diesel"] }, Denali: { engines: ["6.2L V8", "3.0L Duramax Diesel"] } } },
      Canyon: { trims: { Elevation: { engines: ["2.7L Turbo"] }, AT4: { engines: ["2.7L Turbo"] }, Denali: { engines: ["2.7L Turbo"] } } },
    },
  },
  RAM: {
    models: {
      "1500": { trims: { Tradesman: { engines: ["3.6L V6"] }, "Big Horn": { engines: ["3.6L V6", "5.7L V8"] }, Laramie: { engines: ["5.7L V8"] }, Rebel: { engines: ["5.7L V8"] }, Limited: { engines: ["5.7L V8"] }, TRX: { engines: ["6.2L Supercharged V8"] } } },
      "2500": { trims: { Tradesman: { engines: ["6.4L V8"] }, "Big Horn": { engines: ["6.4L V8", "6.7L Cummins Diesel"] }, Laramie: { engines: ["6.7L Cummins Diesel"] }, Limited: { engines: ["6.7L Cummins Diesel"] } } },
      "3500": { trims: { Tradesman: { engines: ["6.4L V8"] }, "Big Horn": { engines: ["6.7L Cummins Diesel"] }, Laramie: { engines: ["6.7L Cummins Diesel"] }, Limited: { engines: ["6.7L Cummins Diesel"] } } },
      ProMaster: { trims: { Base: { engines: ["3.6L V6"] } } },
      "ProMaster City": { trims: { Tradesman: { engines: ["2.4L I4"] }, SLT: { engines: ["2.4L I4"] } } },
    },
  },
  Tesla: {
    models: {
      "Model 3": { trims: { "Standard Range": { engines: ["Electric"] }, "Long Range": { engines: ["Electric"] }, Performance: { engines: ["Electric"] } } },
      "Model S": { trims: { "Long Range": { engines: ["Electric"] }, Plaid: { engines: ["Electric"] } } },
      "Model X": { trims: { "Long Range": { engines: ["Electric"] }, Plaid: { engines: ["Electric"] } } },
      "Model Y": { trims: { "Standard Range": { engines: ["Electric"] }, "Long Range": { engines: ["Electric"] }, Performance: { engines: ["Electric"] } } },
      Cybertruck: { trims: { "Rear-Wheel Drive": { engines: ["Electric"] }, "All-Wheel Drive": { engines: ["Electric"] }, Cyberbeast: { engines: ["Electric"] } } },
    },
  },
  Acura: {
    models: {
      Integra: { trims: { Base: { engines: ["1.5L Turbo"] }, "A Spec": { engines: ["1.5L Turbo"] }, "Type S": { engines: ["2.0L Turbo"] } } },
      ILX: { trims: { Base: { engines: ["2.4L I4"] }, Premium: { engines: ["2.4L I4"] }, "A Spec": { engines: ["2.4L I4"] } } },
      TLX: { trims: { Base: { engines: ["2.0L Turbo"] }, Technology: { engines: ["2.0L Turbo"] }, "A Spec": { engines: ["2.0L Turbo", "3.5L V6"] }, "Type S": { engines: ["3.0L Turbo V6"] } } },
      RDX: { trims: { Base: { engines: ["2.0L Turbo"] }, Technology: { engines: ["2.0L Turbo"] }, "A Spec": { engines: ["2.0L Turbo"] }, Advance: { engines: ["2.0L Turbo"] } } },
      MDX: { trims: { Base: { engines: ["3.5L V6"] }, Technology: { engines: ["3.5L V6"] }, "A Spec": { engines: ["3.5L V6"] }, Advance: { engines: ["3.5L V6"] }, "Type S": { engines: ["3.0L Turbo V6"] } } },
      ZDX: { trims: { "A Spec": { engines: ["Electric"] }, "Type S": { engines: ["Electric"] } } },
    },
  },
  Infiniti: {
    models: {
      Q50: { trims: { Pure: { engines: ["2.0L Turbo"] }, Luxe: { engines: ["3.0L Twin Turbo V6"] }, Sensory: { engines: ["3.0L Twin Turbo V6"] }, "Red Sport": { engines: ["3.0L Twin Turbo V6"] } } },
      Q60: { trims: { Pure: { engines: ["2.0L Turbo"] }, Luxe: { engines: ["3.0L Twin Turbo V6"] }, "Red Sport": { engines: ["3.0L Twin Turbo V6"] } } },
      QX50: { trims: { Pure: { engines: ["2.0L Turbo"] }, Luxe: { engines: ["2.0L Turbo"] }, Sensory: { engines: ["2.0L Turbo"] }, Autograph: { engines: ["2.0L Turbo"] } } },
      QX55: { trims: { Luxe: { engines: ["2.0L Turbo"] }, Sensory: { engines: ["2.0L Turbo"] }, Essential: { engines: ["2.0L Turbo"] } } },
      QX60: { trims: { Pure: { engines: ["3.5L V6"] }, Luxe: { engines: ["3.5L V6"] }, Sensory: { engines: ["3.5L V6"] }, Autograph: { engines: ["3.5L V6"] } } },
      QX80: { trims: { Luxe: { engines: ["5.6L V8"] }, "Premium Select": { engines: ["5.6L V8"] }, Sensory: { engines: ["5.6L V8"] }, Autograph: { engines: ["5.6L V8"] } } },
    },
  },
  Genesis: {
    models: {
      G70: { trims: { Advanced: { engines: ["2.5L Turbo"] }, "Sport Advanced": { engines: ["3.3L Twin Turbo V6"] }, Prestige: { engines: ["2.5L Turbo", "3.3L Twin Turbo V6"] } } },
      G80: { trims: { Advanced: { engines: ["2.5L Turbo"] }, Prestige: { engines: ["2.5L Turbo", "3.5L Twin Turbo V6"] }, Sport: { engines: ["3.5L Twin Turbo V6"] } } },
      G90: { trims: { Advanced: { engines: ["3.5L Twin Turbo V6"] }, Prestige: { engines: ["3.5L Twin Turbo V6"] } } },
      GV60: { trims: { Advanced: { engines: ["Electric"] }, Performance: { engines: ["Electric"] } } },
      GV70: { trims: { Advanced: { engines: ["2.5L Turbo"] }, Sport: { engines: ["3.5L Twin Turbo V6"] }, Prestige: { engines: ["2.5L Turbo", "3.5L Twin Turbo V6"] } } },
      GV80: { trims: { Advanced: { engines: ["2.5L Turbo"] }, Prestige: { engines: ["2.5L Turbo", "3.5L Twin Turbo V6"] } } },
    },
  },
  "Alfa Romeo": {
    models: {
      Giulia: { trims: { Sprint: { engines: ["2.0L Turbo"] }, Ti: { engines: ["2.0L Turbo"] }, Veloce: { engines: ["2.0L Turbo"] }, Quadrifoglio: { engines: ["2.9L Twin Turbo V6"] } } },
      Stelvio: { trims: { Sprint: { engines: ["2.0L Turbo"] }, Ti: { engines: ["2.0L Turbo"] }, Veloce: { engines: ["2.0L Turbo"] }, Quadrifoglio: { engines: ["2.9L Twin Turbo V6"] } } },
      Tonale: { trims: { Sprint: { engines: ["1.3L Turbo Hybrid"] }, Ti: { engines: ["1.3L Turbo Hybrid"] }, Veloce: { engines: ["Plug-In Hybrid"] } } },
    },
  },
  Fiat: {
    models: {
      "500": { trims: { Pop: { engines: ["1.4L I4"] }, Lounge: { engines: ["1.4L I4"] } } },
      "500X": { trims: { Pop: { engines: ["1.3L Turbo"] }, Trekking: { engines: ["1.3L Turbo"] } } },
      "500L": { trims: { Pop: { engines: ["1.4L Turbo"] }, Lounge: { engines: ["1.4L Turbo"] } } },
    },
  },
  Mitsubishi: {
    models: {
      Mirage: { trims: { ES: { engines: ["1.2L I3"] }, LE: { engines: ["1.2L I3"] }, SE: { engines: ["1.2L I3"] } } },
      Lancer: { trims: { ES: { engines: ["2.0L I4"] }, SE: { engines: ["2.4L I4"] }, GT: { engines: ["2.4L I4"] } } },
      Outlander: { trims: { ES: { engines: ["2.5L I4"] }, SE: { engines: ["2.5L I4"] }, SEL: { engines: ["2.5L I4"] }, GT: { engines: ["2.5L I4"] }, PHEV: { engines: ["Plug-In Hybrid"] } } },
      "Outlander Sport": { trims: { ES: { engines: ["2.0L I4"] }, LE: { engines: ["2.0L I4"] }, SE: { engines: ["2.4L I4"] } } },
      "Eclipse Cross": { trims: { ES: { engines: ["1.5L Turbo"] }, LE: { engines: ["1.5L Turbo"] }, SE: { engines: ["1.5L Turbo"] } } },
    },
  },
  Volvo: {
    models: {
      S60: { trims: { Core: { engines: ["2.0L Turbo"] }, Plus: { engines: ["2.0L Turbo"] }, Ultimate: { engines: ["2.0L Turbo"] }, "Polestar Engineered": { engines: ["Plug-In Hybrid"] } } },
      S90: { trims: { Core: { engines: ["2.0L Turbo"] }, Plus: { engines: ["2.0L Turbo"] }, Ultimate: { engines: ["2.0L Turbo Hybrid"] } } },
      C40: { trims: { Core: { engines: ["Electric"] }, Plus: { engines: ["Electric"] }, Ultimate: { engines: ["Electric"] } } },
      XC40: { trims: { Core: { engines: ["2.0L Turbo"] }, Plus: { engines: ["2.0L Turbo"] }, Ultimate: { engines: ["2.0L Turbo"] }, Recharge: { engines: ["Electric"] } } },
      XC60: { trims: { Core: { engines: ["2.0L Turbo"] }, Plus: { engines: ["2.0L Turbo", "2.0L Turbo Hybrid"] }, Ultimate: { engines: ["2.0L Turbo Hybrid"] } } },
      XC90: { trims: { Core: { engines: ["2.0L Turbo"] }, Plus: { engines: ["2.0L Turbo Hybrid"] }, Ultimate: { engines: ["2.0L Turbo Hybrid"] } } },
    },
  },
  Porsche: {
    models: {
      "718 Cayman": { trims: { Base: { engines: ["2.0L Turbo"] }, S: { engines: ["2.5L Turbo"] }, GTS: { engines: ["2.5L Turbo"] }, GT4: { engines: ["4.0L Flat-6"] } } },
      "718 Boxster": { trims: { Base: { engines: ["2.0L Turbo"] }, S: { engines: ["2.5L Turbo"] }, GTS: { engines: ["2.5L Turbo"] }, Spyder: { engines: ["4.0L Flat-6"] } } },
      Macan: { trims: { Base: { engines: ["2.0L Turbo"] }, S: { engines: ["2.9L Twin Turbo V6"] }, GTS: { engines: ["2.9L Twin Turbo V6"] } } },
      Cayenne: { trims: { Base: { engines: ["3.0L Turbo V6"] }, S: { engines: ["2.9L Twin Turbo V6"] }, GTS: { engines: ["4.0L Twin Turbo V8"] }, Turbo: { engines: ["4.0L Twin Turbo V8"] } } },
      Panamera: { trims: { Base: { engines: ["2.9L Twin Turbo V6"] }, "4S": { engines: ["2.9L Twin Turbo V6"] }, GTS: { engines: ["4.0L Twin Turbo V8"] }, "Turbo S": { engines: ["4.0L Twin Turbo V8"] } } },
      "911": { trims: { Carrera: { engines: ["3.0L Twin Turbo Flat-6"] }, "Carrera S": { engines: ["3.0L Twin Turbo Flat-6"] }, GTS: { engines: ["3.0L Twin Turbo Flat-6"] }, Turbo: { engines: ["3.7L Twin Turbo Flat-6"] }, "Turbo S": { engines: ["3.7L Twin Turbo Flat-6"] } } },
      Taycan: { trims: { Base: { engines: ["Electric"] }, "4S": { engines: ["Electric"] }, GTS: { engines: ["Electric"] }, Turbo: { engines: ["Electric"] }, "Turbo S": { engines: ["Electric"] } } },
    },
  },
  Jaguar: {
    models: {
      XE: { trims: { S: { engines: ["2.0L Turbo"] }, "R Dynamic S": { engines: ["2.0L Turbo"] }, "R Dynamic SE": { engines: ["2.0L Turbo"] } } },
      XF: { trims: { S: { engines: ["2.0L Turbo"] }, "R Dynamic S": { engines: ["2.0L Turbo"] }, "R Dynamic SE": { engines: ["3.0L Supercharged V6"] } } },
      "F-PACE": { trims: { S: { engines: ["2.0L Turbo"] }, "R Dynamic S": { engines: ["2.0L Turbo"] }, "R Dynamic SE": { engines: ["3.0L Supercharged V6"] }, SVR: { engines: ["5.0L Supercharged V8"] } } },
      "E-PACE": { trims: { S: { engines: ["2.0L Turbo"] }, "R Dynamic S": { engines: ["2.0L Turbo"] }, "R Dynamic SE": { engines: ["2.0L Turbo"] } } },
      "I-PACE": { trims: { S: { engines: ["Electric"] }, SE: { engines: ["Electric"] }, HSE: { engines: ["Electric"] } } },
    },
  },
  "Land Rover": {
    models: {
      "Range Rover": { trims: { SE: { engines: ["3.0L I6"] }, HSE: { engines: ["3.0L I6", "Plug-In Hybrid"] }, Autobiography: { engines: ["4.4L Twin Turbo V8"] } } },
      "Range Rover Sport": { trims: { SE: { engines: ["3.0L I6"] }, HSE: { engines: ["3.0L I6", "Plug-In Hybrid"] }, Autobiography: { engines: ["4.4L Twin Turbo V8"] }, SVR: { engines: ["5.0L Supercharged V8"] } } },
      Defender: { trims: { S: { engines: ["2.0L Turbo"] }, SE: { engines: ["3.0L I6"] }, HSE: { engines: ["3.0L I6"] }, "X-Dynamic": { engines: ["3.0L I6"] } } },
      Discovery: { trims: { S: { engines: ["3.0L I6"] }, SE: { engines: ["3.0L I6"] }, HSE: { engines: ["3.0L I6"] }, "R-Dynamic": { engines: ["3.0L I6"] } } },
      "Discovery Sport": { trims: { S: { engines: ["2.0L Turbo"] }, SE: { engines: ["2.0L Turbo"] }, HSE: { engines: ["2.0L Turbo"] } } },
      Evoque: { trims: { S: { engines: ["2.0L Turbo"] }, SE: { engines: ["2.0L Turbo"] }, HSE: { engines: ["2.0L Turbo"] }, "R-Dynamic": { engines: ["2.0L Turbo"] } } },
    },
  },
  Mini: {
    models: {
      Cooper: { trims: { Base: { engines: ["1.5L Turbo"] }, Signature: { engines: ["1.5L Turbo"] } } },
      "Cooper S": { trims: { Base: { engines: ["2.0L Turbo"] }, Signature: { engines: ["2.0L Turbo"] }, Iconic: { engines: ["2.0L Turbo"] } } },
      Clubman: { trims: { Cooper: { engines: ["1.5L Turbo"] }, "Cooper S": { engines: ["2.0L Turbo"] }, "John Cooper Works": { engines: ["2.0L Turbo"] } } },
      Countryman: { trims: { Cooper: { engines: ["1.5L Turbo"] }, "Cooper S": { engines: ["2.0L Turbo"] }, "Cooper SE Plug In Hybrid": { engines: ["Plug-In Hybrid"] }, "John Cooper Works": { engines: ["2.0L Turbo"] } } },
      "John Cooper Works": { trims: { Base: { engines: ["2.0L Turbo"] }, GP: { engines: ["2.0L Turbo"] } } },
    },
  },
  Audi: {
    models: {
      A3: { trims: { Premium: { engines: ["2.0L Turbo"] }, "Premium Plus": { engines: ["2.0L Turbo"] }, S3: { engines: ["2.0L Turbo"] } } },
      A4: { trims: { Premium: { engines: ["2.0L Turbo"] }, "Premium Plus": { engines: ["2.0L Turbo"] }, Prestige: { engines: ["2.0L Turbo"] }, S4: { engines: ["3.0L Turbo V6"] } } },
      A5: { trims: { Premium: { engines: ["2.0L Turbo"] }, "Premium Plus": { engines: ["2.0L Turbo"] }, Prestige: { engines: ["2.0L Turbo"] }, S5: { engines: ["3.0L Turbo V6"] } } },
      A6: { trims: { Premium: { engines: ["2.0L Turbo"] }, "Premium Plus": { engines: ["3.0L Turbo V6"] }, Prestige: { engines: ["3.0L Turbo V6"] }, S6: { engines: ["2.9L Twin Turbo V6"] } } },
      A7: { trims: { "Premium Plus": { engines: ["3.0L Turbo V6"] }, Prestige: { engines: ["3.0L Turbo V6"] }, S7: { engines: ["2.9L Twin Turbo V6"] } } },
      A8: { trims: { "L 55": { engines: ["3.0L Turbo V6"] }, "L 60": { engines: ["4.0L Twin Turbo V8"] } } },
      Q3: { trims: { Premium: { engines: ["2.0L Turbo"] }, "Premium Plus": { engines: ["2.0L Turbo"] }, "S Line Prestige": { engines: ["2.0L Turbo"] } } },
      Q5: { trims: { Premium: { engines: ["2.0L Turbo"] }, "Premium Plus": { engines: ["2.0L Turbo"] }, Prestige: { engines: ["2.0L Turbo"] }, SQ5: { engines: ["3.0L Turbo V6"] } } },
      Q7: { trims: { Premium: { engines: ["3.0L Turbo V6"] }, "Premium Plus": { engines: ["3.0L Turbo V6"] }, Prestige: { engines: ["3.0L Turbo V6"] }, SQ7: { engines: ["4.0L Twin Turbo V8"] } } },
      Q8: { trims: { Premium: { engines: ["3.0L Turbo V6"] }, "Premium Plus": { engines: ["3.0L Turbo V6"] }, Prestige: { engines: ["3.0L Turbo V6"] }, SQ8: { engines: ["4.0L Twin Turbo V8"] } } },
      "e-tron": { trims: { "Premium Plus": { engines: ["Electric"] }, Prestige: { engines: ["Electric"] }, Sportback: { engines: ["Electric"] } } },
    },
  },
  BMW: {
    models: {
      "228i": { trims: { Base: { engines: ["2.0L Turbo"] }, xDrive: { engines: ["2.0L Turbo"] } } },
      "330i": { trims: { Base: { engines: ["2.0L Turbo"] }, xDrive: { engines: ["2.0L Turbo"] }, M340i: { engines: ["3.0L Turbo I6"] } } },
      "530i": { trims: { Base: { engines: ["2.0L Turbo"] }, xDrive: { engines: ["2.0L Turbo"] }, "540i": { engines: ["3.0L Turbo I6"] } } },
      "740i": { trims: { Base: { engines: ["3.0L Turbo I6"] }, xDrive: { engines: ["3.0L Turbo I6"] }, "760i": { engines: ["4.4L Twin Turbo V8"] } } },
      X1: { trims: { xDrive28i: { engines: ["2.0L Turbo"] } } },
      X3: { trims: { sDrive30i: { engines: ["2.0L Turbo"] }, xDrive30i: { engines: ["2.0L Turbo"] }, M40i: { engines: ["3.0L Turbo I6"] } } },
      X5: { trims: { sDrive40i: { engines: ["3.0L Turbo I6"] }, xDrive40i: { engines: ["3.0L Turbo I6"] }, M60i: { engines: ["4.4L Twin Turbo V8"] } } },
      X7: { trims: { xDrive40i: { engines: ["3.0L Turbo I6"] }, M60i: { engines: ["4.4L Twin Turbo V8"] } } },
      M3: { trims: { Base: { engines: ["3.0L Twin Turbo I6"] }, Competition: { engines: ["3.0L Twin Turbo I6"] } } },
      M5: { trims: { Base: { engines: ["4.4L Twin Turbo V8"] }, Competition: { engines: ["4.4L Twin Turbo V8"] } } },
      i4: { trims: { eDrive35: { engines: ["Electric"] }, eDrive40: { engines: ["Electric"] }, M50: { engines: ["Electric"] } } },
    },
  },
};
