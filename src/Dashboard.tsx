import type { Activity } from "./api/strava";
import { PowerCurve } from "./pages/performance/PowerCurve";
import { ZoneDistribution } from "./pages/performance/ZoneDistribution";
import { HRZoneDistribution } from "./pages/performance/HRZoneDistribution";
import { Settings } from "./pages/Settings";
import { TempPerformance } from "./pages/performance/TempPerformance";
import { FitnessChart } from "./pages/FitnessChart";
import { RecordsPage } from "./pages/RecordsPage";
import { HomePage } from "./pages/HomePage";
import { ActivitiesPage } from "./pages/ActivitiesPage";

export type Page = "home" | "performance" | "activities" | "settings" | "fitness" | "records";

interface Props {
  activities: Activity[];
  page: Page;
  onNavigate: (page: Page) => void;
}

export function Dashboard({ activities, page, onNavigate }: Props) {
  switch (page) {
    case "home":        return <HomePage activities={activities} onNavigate={onNavigate} />;
    case "activities":  return <ActivitiesPage activities={activities} />;
    case "fitness":     return <FitnessChart activities={activities} />;
    case "records":     return <RecordsPage activities={activities} />;
    case "performance": return (
      <>
        <PowerCurve activities={activities} />
        <ZoneDistribution activities={activities} onNavigate={onNavigate} />
        <HRZoneDistribution activities={activities} onNavigate={onNavigate} />
        <TempPerformance activities={activities} />
      </>
    );
    case "settings":    return <Settings />;
  }
}
