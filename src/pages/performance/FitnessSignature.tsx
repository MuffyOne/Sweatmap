import { useEffect, useMemo, useState } from "react";
import { CollapsibleSection } from "../../lib/CollapsibleSection";
import { POWER_CURVE_UPDATED, computeSignature, labelToSeconds, type FitnessSignature as Signature, type MmpPoint } from "../../lib/powerModel";
import { getCachedTrainingInfo } from "../../api/xert";
import type { SportFilter } from "../../lib/utils";
import styles from "./FitnessSignature.module.css";

interface CachedCurve {
  data: { label: string; watts: number }[];
}

function loadCurve(key: string): MmpPoint[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCurve | { label: string; watts: number }[];
    const data = Array.isArray(parsed) ? parsed : parsed.data;
    return data.map((p) => ({ seconds: labelToSeconds(p.label), watts: p.watts }));
  } catch {
    return null;
  }
}

function loadSignatures(sportFilter: SportFilter): { recent: Signature | null; allTime: Signature | null } {
  const recent = loadCurve(`power_curve_${sportFilter}_90d`);
  const allTime = loadCurve(`power_curve_alltime_${sportFilter}`);
  return {
    recent: recent ? computeSignature(recent) : null,
    allTime: allTime ? computeSignature(allTime) : null,
  };
}

interface Props {
  sportFilter: SportFilter;
}

export function FitnessSignature({ sportFilter }: Props) {
  const [sigs, setSigs] = useState(() => loadSignatures(sportFilter));

  useEffect(() => {
    const refresh = () => setSigs(loadSignatures(sportFilter));
    refresh();
    window.addEventListener(POWER_CURVE_UPDATED, refresh);
    return () => window.removeEventListener(POWER_CURVE_UPDATED, refresh);
  }, [sportFilter]);

  const xert = useMemo(() => getCachedTrainingInfo()?.signature ?? null, []);
  const { recent, allTime } = sigs;

  if (!recent && !allTime) {
    return (
      <CollapsibleSection title="Fitness Signature">
        <p className={styles.note}>
          Needs power data. Open the Power Curve above and let it finish loading, then this will fill in.
        </p>
      </CollapsibleSection>
    );
  }

  const cell = (v: number | undefined | null, unit: string) => (v == null ? "–" : `${v} ${unit}`);

  const rows: { label: string; recent?: number; allTime?: number; xert?: number; unit: string }[] = [
    { label: "FTP (modelled 60 min)", recent: recent?.ftp, allTime: allTime?.ftp, xert: xert?.ftp, unit: "W" },
    { label: "CP (critical power)", recent: recent?.cp, allTime: allTime?.cp, unit: "W" },
    { label: "LTP (est. 75% of CP)", recent: recent?.ltp, allTime: allTime?.ltp, xert: xert?.ltp, unit: "W" },
    { label: "HIE", recent: recent?.hie, allTime: allTime?.hie, xert: xert?.hie, unit: "kJ" },
    { label: "Peak power (best 1 s)", recent: recent?.pp, allTime: allTime?.pp, xert: xert?.pp, unit: "W" },
    { label: "95% of best 20 min", recent: recent?.ftp20 ?? undefined, allTime: allTime?.ftp20 ?? undefined, unit: "W" },
  ];

  const err = recent?.fitError ?? allTime?.fitError;

  return (
    <CollapsibleSection title="Fitness Signature">
      <table className={styles.table}>
        <thead>
          <tr>
            <th></th>
            <th>Last 90 days</th>
            <th>All time</th>
            {xert && <th>XERT</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{cell(r.recent, r.unit)}</td>
              <td>{cell(r.allTime, r.unit)}</td>
              {xert && <td>{cell(r.xert, r.unit)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        Morton 3-parameter critical power model fitted to your best efforts from 5 s to 30 min
        {err != null && ` (fit error ${(err * 100).toFixed(1)}%)`}. Experimental: compare against XERT before trusting it.
      </p>
    </CollapsibleSection>
  );
}
