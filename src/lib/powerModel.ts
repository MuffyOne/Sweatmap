/**
 * Morton's 3-parameter critical power model:
 *   P(t) = CP + W' / (t + W' / (Pmax - CP))
 * Fitted to a mean-maximal power (MMP) curve to derive a "fitness signature".
 */

export interface MmpPoint {
  seconds: number;
  watts: number;
}

export interface PowerModel {
  /** Critical power (W), the asymptote of the curve. */
  cp: number;
  /** Work capacity above CP (J). */
  wPrime: number;
  /** Modelled instantaneous maximal power (W). */
  pMax: number;
}

export interface FitnessSignature {
  /** Modelled 60-minute power, the FTP estimate (W). */
  ftp: number;
  /** Critical power from the model (W). Usually a bit above `ftp`. */
  cp: number;
  /** Lower threshold power estimate (W). Heuristic: 78% of CP (XERT's observed ratio). */
  ltp: number;
  /** High intensity energy (kJ). */
  hie: number;
  /** Peak power: best measured 1 s power, falling back to model pMax (W). */
  pp: number;
  /** 95% of best 20 min power, for cross-checking (W). */
  ftp20: number | null;
  /** RMS relative error of the fit (0.02 = 2%). */
  fitError: number;
  /** The fitted model, for drawing the curve. */
  model: PowerModel;
}

/**
 * Durations used for the fit. Sprint efforts (< 2 min) follow a different regime and distort CP and W'
 * (they pushed CP up and W' down in testing), so they are excluded. Peak power is taken from the
 * measured best 1 s instead. Validated against XERT: 2 min to 1 h gave <1% fit error.
 */
const FIT_MIN_SECONDS = 120;
const FIT_MAX_SECONDS = 3600;
const MIN_POINTS = 4;

export function modelPower(m: PowerModel, t: number): number {
  const k = m.wPrime / (m.pMax - m.cp);
  return m.cp + m.wPrime / (t + k);
}

/** Sum of squared relative errors of the model against the measured curve, for given CP and W'. */
function objective(x: number[], pMax: number, pts: MmpPoint[]): number {
  const [cp, wPrime] = x;
  if (cp <= 0 || wPrime <= 1000 || wPrime > 80000 || pMax <= cp * 1.05) return 1e9;
  const m = { cp, wPrime, pMax };
  let sum = 0;
  for (const p of pts) {
    const rel = (modelPower(m, p.seconds) - p.watts) / p.watts;
    sum += rel * rel;
  }
  return sum;
}

/** Minimal Nelder-Mead simplex minimiser. */
function nelderMead(f: (x: number[]) => number, start: number[], steps: number[], iterations = 600): number[] {
  const n = start.length;
  let simplex = [start, ...start.map((_, i) => start.map((v, j) => (j === i ? v + steps[i] : v)))];
  let scores = simplex.map(f);

  for (let it = 0; it < iterations; it++) {
    const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
    simplex = order.map((i) => simplex[i]);
    scores = order.map((i) => scores[i]);

    const centroid = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((s, p) => s + p[j], 0) / n);
    const worst = simplex[n];
    const along = (c: number) => centroid.map((v, j) => v + c * (worst[j] - v));

    const reflected = along(-1);
    const fr = f(reflected);
    if (fr < scores[0]) {
      const expanded = along(-2);
      const fe = f(expanded);
      simplex[n] = fe < fr ? expanded : reflected;
      scores[n] = Math.min(fe, fr);
    } else if (fr < scores[n - 1]) {
      simplex[n] = reflected;
      scores[n] = fr;
    } else {
      const contracted = along(fr < scores[n] ? -0.5 : 0.5);
      const fc = f(contracted);
      if (fc < Math.min(fr, scores[n])) {
        simplex[n] = contracted;
        scores[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          scores[i] = f(simplex[i]);
        }
      }
    }
  }

  const best = scores.indexOf(Math.min(...scores));
  return simplex[best];
}

/**
 * Fits CP and W' with Pmax pinned to the measured sprint power.
 *
 * Pmax is the model's power at t=0, but the fit only sees efforts from 2 min upward, so left free it is barely
 * constrained and trades off against W': a 5% better 5-minute effort moved W' by +45% (20 to 29 kJ), and the
 * all-time curve gave 40 kJ against 19 kJ once pinned. Pinning it makes W' respond in proportion to the data.
 * The result is insensitive to the exact pin: 1000 W and 1147 W gave the same CP and W' within 1 kJ.
 */
export function fitPowerModel(curve: MmpPoint[]): { model: PowerModel; error: number } | null {
  const pts = curve.filter((p) => p.seconds >= FIT_MIN_SECONDS && p.seconds <= FIT_MAX_SECONDS && p.watts > 0);
  if (pts.length < MIN_POINTS) return null;

  const sprint = Math.max(0, ...curve.filter((p) => p.seconds <= 10).map((p) => p.watts));
  const peak = Math.max(...pts.map((p) => p.watts));
  const pMax = sprint > peak * 1.2 ? sprint : peak * 2;

  const longest = pts.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  const x0 = [longest.watts * (longest.seconds >= 1200 ? 0.97 : 0.9), 15000];
  const x = nelderMead((v) => objective(v, pMax, pts), x0, [x0[0] * 0.1, 5000]);
  const err = objective(x, pMax, pts);
  if (err >= 1e9) return null;

  return {
    model: { cp: x[0], wPrime: x[1], pMax },
    error: Math.sqrt(err / pts.length),
  };
}

export function computeSignature(curve: MmpPoint[]): FitnessSignature | null {
  const fit = fitPowerModel(curve);
  if (!fit) return null;
  const { model } = fit;

  const best1s = curve.find((p) => p.seconds === 1)?.watts;
  const best20 = curve.find((p) => p.seconds === 1200)?.watts;

  return {
    ftp: Math.round(modelPower(model, 3600)),
    cp: Math.round(model.cp),
    ltp: Math.round(model.cp * 0.78),
    hie: Math.round(model.wPrime / 100) / 10,
    pp: Math.round(best1s ?? model.pMax),
    ftp20: best20 ? Math.round(best20 * 0.95) : null,
    fitError: fit.error,
    model,
  };
}

/** Parse the labels used by PowerCurve ("30s", "5min", "1h") back to seconds. */
export function labelToSeconds(label: string): number {
  const n = parseFloat(label);
  if (label.endsWith("min")) return n * 60;
  if (label.endsWith("h")) return n * 3600;
  return n;
}

/** Fired by PowerCurve after it refreshes its cached curves. */
export const POWER_CURVE_UPDATED = "power-curve-updated";
