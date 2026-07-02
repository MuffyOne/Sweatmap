export interface Climb {
  name: string;
  country: string;
  region: string;
  start: [number, number]; // [lat, lng] at the foot of the climb
  end: [number, number];   // [lat, lng] at the summit / top
  segmentId?: number;      // optional — used to link to Strava segment page
  length_km?: number;
  elevation_m?: number;
  avg_gradient?: number;
}

export const PRESET_CLIMBS: Climb[] = [
  {
    name: "Alpe d'Huez",
    country: "France", region: "Alps",
    start: [45.0556, 6.0277], end: [45.0933, 6.0712],
    length_km: 13.8, elevation_m: 1071, avg_gradient: 7.9,
  },
  {
    name: "Mont Ventoux (Bédoin)",
    country: "France", region: "Provence",
    start: [44.1248, 5.1839], end: [44.1742, 5.2784],
    length_km: 21.5, elevation_m: 1610, avg_gradient: 7.5,
  },
  {
    name: "Col du Galibier",
    country: "France", region: "Alps",
    start: [45.1026, 6.4349], end: [45.0639, 6.4006],
    length_km: 17.7, elevation_m: 1245, avg_gradient: 6.9,
  },
  {
    name: "Col du Tourmalet",
    country: "France", region: "Pyrenees",
    start: [43.1041, 0.2208], end: [42.9090, 0.1492],
    length_km: 17.2, elevation_m: 1404, avg_gradient: 7.4,
  },
  {
    name: "Col de la Madeleine",
    country: "France", region: "Alps",
    start: [45.3733, 6.3040], end: [45.4243, 6.5197],
    length_km: 19.2, elevation_m: 1520, avg_gradient: 7.8,
  },
  {
    name: "Col d'Izoard",
    country: "France", region: "Alps",
    start: [44.8981, 6.6331], end: [44.8194, 6.7352],
    length_km: 14.1, elevation_m: 939, avg_gradient: 6.6,
  },
  {
    name: "Col du Glandon",
    country: "France", region: "Alps",
    start: [45.3044, 6.2420], end: [45.3287, 6.2687],
    length_km: 21.4, elevation_m: 1534, avg_gradient: 6.9,
  },
  {
    name: "Passo dello Stelvio",
    country: "Italy", region: "Alps",
    start: [46.6149, 10.6142], end: [46.5267, 10.4519],
    length_km: 24.3, elevation_m: 1808, avg_gradient: 7.1,
  },
  {
    name: "Passo del Mortirolo",
    country: "Italy", region: "Alps",
    start: [46.2176, 10.2099], end: [46.2386, 10.2988],
    length_km: 12.4, elevation_m: 1300, avg_gradient: 10.5,
  },
  {
    name: "Monte Zoncolan",
    country: "Italy", region: "Alps",
    start: [46.4892, 12.9120], end: [46.5033, 12.9297],
    length_km: 10.1, elevation_m: 1210, avg_gradient: 11.9,
  },
  {
    name: "Passo di Gavia",
    country: "Italy", region: "Alps",
    start: [46.2548, 10.5073], end: [46.3536, 10.5077],
    segmentId: 614727,
    length_km: 17.3, elevation_m: 1363, avg_gradient: 7.9,
  },
  {
    name: "Colle delle Finestre",
    country: "Italy", region: "Alps",
    start: [45.1393, 7.0491], end: [45.0765, 7.1429],
    length_km: 18.5, elevation_m: 1678, avg_gradient: 9.1,
  },
  {
    name: "Biolo Guspessa",
    country: "Italy", region: "Lombardy",
    start: [46.2316, 10.2555], end: [46.2560, 10.2820],
    segmentId: 31930030,
  },
  {
    name: "Sa Calobra",
    country: "Spain", region: "Mallorca",
    start: [39.8484, 2.7969], end: [39.8514, 2.8131],
    length_km: 9.4, elevation_m: 671, avg_gradient: 6.9,
  },
  {
    name: "L'Angliru",
    country: "Spain", region: "Asturias",
    start: [43.1959, -5.9318], end: [43.2082, -5.8995],
    length_km: 12.5, elevation_m: 1266, avg_gradient: 9.9,
  },
];
