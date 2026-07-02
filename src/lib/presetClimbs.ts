// Segment IDs are best-effort approximations — Strava has multiple segments per climb
// and exact IDs vary. If a climb shows 0 ascents and you've ridden it, add the correct
// segment ID via Settings → My Climbs.
export interface Climb {
  segmentId: number;
  name: string;
  country: string;
  region: string;
  // Optional — derived from live Strava segment data when not provided
  length_km?: number;
  elevation_m?: number;
  avg_gradient?: number;
}

export const PRESET_CLIMBS: Climb[] = [
  { segmentId: 629438,  name: "Alpe d'Huez",             country: "France",  region: "Alps",      length_km: 13.8, elevation_m: 1071, avg_gradient: 7.9 },
  { segmentId: 636795,  name: "Mont Ventoux (Bédoin)",    country: "France",  region: "Provence",  length_km: 21.5, elevation_m: 1610, avg_gradient: 7.5 },
  { segmentId: 1783880, name: "Col du Galibier",           country: "France",  region: "Alps",      length_km: 17.7, elevation_m: 1245, avg_gradient: 6.9 },
  { segmentId: 1631864, name: "Col du Tourmalet",          country: "France",  region: "Pyrenees",  length_km: 17.2, elevation_m: 1404, avg_gradient: 7.4 },
  { segmentId: 1783879, name: "Col de la Madeleine",       country: "France",  region: "Alps",      length_km: 19.2, elevation_m: 1520, avg_gradient: 7.8 },
  { segmentId: 4786836, name: "Col d'Izoard",              country: "France",  region: "Alps",      length_km: 14.1, elevation_m:  939, avg_gradient: 6.6 },
  { segmentId: 4786959, name: "Col du Glandon",            country: "France",  region: "Alps",      length_km: 21.4, elevation_m: 1534, avg_gradient: 6.9 },
  { segmentId: 6350938, name: "Puy de Dôme",               country: "France",  region: "Auvergne",  length_km: 13.8, elevation_m: 1197, avg_gradient: 7.7 },
  { segmentId: 5751792, name: "Passo dello Stelvio",       country: "Italy",   region: "Alps",      length_km: 24.3, elevation_m: 1808, avg_gradient: 7.1 },
  { segmentId: 6903688, name: "Passo del Mortirolo",       country: "Italy",   region: "Alps",      length_km: 12.4, elevation_m: 1300, avg_gradient: 10.5 },
  { segmentId: 2175578, name: "Monte Zoncolan",            country: "Italy",   region: "Alps",      length_km: 10.1, elevation_m: 1210, avg_gradient: 11.9 },
  { segmentId: 614727,  name: "Passo di Gavia",            country: "Italy",   region: "Alps",      length_km: 17.3, elevation_m: 1363, avg_gradient: 7.9 },
  { segmentId: 6420718, name: "Colle delle Finestre",      country: "Italy",   region: "Alps",      length_km: 18.5, elevation_m: 1678, avg_gradient: 9.1 },
  { segmentId: 4039143, name: "Sa Calobra",                country: "Spain",   region: "Mallorca",  length_km: 9.4,  elevation_m:  671, avg_gradient: 6.9 },
  { segmentId: 4038540, name: "L'Angliru",                 country: "Spain",   region: "Asturias",  length_km: 12.5, elevation_m: 1266, avg_gradient: 9.9 },
  { segmentId: 31930030, name: "Biolo Guspessa",           country: "Italy",   region: "Lombardy" },
];
