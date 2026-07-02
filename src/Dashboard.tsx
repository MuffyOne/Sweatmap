import React, { Suspense } from "react";
import type { Activity, SegmentEffort } from "./api/strava";

const HomePage = React.lazy(() => import("./pages/HomePage").then(m => ({ default: m.HomePage })));
const ActivitiesPage = React.lazy(() => import("./pages/ActivitiesPage").then(m => ({ default: m.ActivitiesPage })));
const FitnessChart = React.lazy(() => import("./pages/FitnessChart").then(m => ({ default: m.FitnessChart })));
const RecordsPage = React.lazy(() => import("./pages/RecordsPage").then(m => ({ default: m.RecordsPage })));
const Settings = React.lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const ServicesPage = React.lazy(() => import("./pages/ServicesPage").then(m => ({ default: m.ServicesPage })));
const XertPage = React.lazy(() => import("./pages/XertPage").then(m => ({ default: m.XertPage })));
const PowerCurve = React.lazy(() => import("./pages/performance/PowerCurve").then(m => ({ default: m.PowerCurve })));
const ZoneDistribution = React.lazy(() => import("./pages/performance/ZoneDistribution").then(m => ({ default: m.ZoneDistribution })));
const HRZoneDistribution = React.lazy(() => import("./pages/performance/HRZoneDistribution").then(m => ({ default: m.HRZoneDistribution })));
const TempPerformance = React.lazy(() => import("./pages/performance/TempPerformance").then(m => ({ default: m.TempPerformance })));
const WhatsNewPage = React.lazy(() => import("./pages/WhatsNewPage").then(m => ({ default: m.WhatsNewPage })));
const MapPage = React.lazy(() => import("./pages/MapPage").then(m => ({ default: m.MapPage })));
const ClimbsPage = React.lazy(() => import("./pages/ClimbsPage").then(m => ({ default: m.ClimbsPage })));

export type Page = "home" | "performance" | "activities" | "settings" | "fitness" | "records" | "services" | "xert" | "whatsNew" | "map" | "climbs";

interface Props {
  activities: Activity[];
  koms: SegmentEffort[];
  page: Page;
  onNavigate: (page: Page) => void;
  onForceSync: () => Promise<void>;
  forceSyncing: boolean;
  fetchedCount: number;
  onXertChange: () => void;
}

function PageContent({ activities, koms, page, onNavigate, onForceSync, forceSyncing, fetchedCount, onXertChange }: Props) {
  switch (page) {
    case "home":        return <HomePage activities={activities} />;
    case "activities":  return <ActivitiesPage activities={activities} />;
    case "fitness":     return <FitnessChart activities={activities} />;
    case "records":     return <RecordsPage activities={activities} koms={koms} />;
    case "performance": return (
      <>
        <PowerCurve activities={activities} />
        <ZoneDistribution activities={activities} onNavigate={onNavigate} />
        <HRZoneDistribution activities={activities} onNavigate={onNavigate} />
        <TempPerformance activities={activities} />
      </>
    );
    case "settings":    return <Settings onForceSync={onForceSync} forceSyncing={forceSyncing} fetchedCount={fetchedCount} />;
    case "services":    return <ServicesPage onXertChange={onXertChange} />;
    case "xert":        return <XertPage />;
    case "whatsNew":    return <WhatsNewPage onNavigate={onNavigate} />;
    case "map":         return <MapPage activities={activities} />;
    case "climbs":      return <ClimbsPage activities={activities} onNavigate={onNavigate} />;
  }
}

export function Dashboard(props: Props) {
  return (
    <Suspense fallback={<div className="loading-screen"><div className="loading-title">Loading…</div></div>}>
      <PageContent {...props} />
    </Suspense>
  );
}
