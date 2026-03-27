export interface Athlete {
  id: number;
  firstname: string;
  lastname: string;
  profile_medium?: string;
}

export interface SegmentEffort {
  id: number;
  elapsed_time: number;
  start_date: string;
  segment: {
    id: number;
    name: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    city: string | null;
    state: string | null;
    country: string | null;
    climb_category: number;
  };
  activity: { id: number };
}

export interface ActivityStreams {
  time?: number[];
  altitude?: number[];
  heartrate?: number[];
  watts?: number[];
  cadence?: number[];
  velocity_smooth?: number[];
}

export interface Activity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  kudos_count: number;
  suffer_score?: number;
  pr_count?: number;
  achievement_count?: number;
  average_temp?: number;
}
