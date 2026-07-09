/**
 * Dashboard placeholder data.
 *
 * NOTE: The backend REST contract is not yet frozen in this repository, so the
 * dashboard is rendered from realistic, in-memory placeholder data. This module
 * is the single source for that data and is shaped so it can later be replaced
 * by a real data source without touching presentation components.
 */

export interface MacroNutrient {
  id: "protein" | "carbs" | "fat";
  label: string;
  consumed: number;
  goal: number;
  unit: string;
}

export interface MealEntry {
  id: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  label: string;
  title: string | null;
  calories: number | null;
}

export interface GoalTarget {
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
}

export interface ActivityMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
}

export interface DashboardData {
  userName: string;
  calories: {
    goal: number;
    consumed: number;
  };
  macros: MacroNutrient[];
  water: {
    current: number;
    goal: number;
    unit: string;
  };
  meals: MealEntry[];
  goals: GoalTarget[];
  aiInsight: {
    title: string;
    message: string;
  };
  weight: {
    current: number;
    unit: string;
    weeklyChange: number;
  };
  activity: ActivityMetric[];
}

/** Returns the dashboard placeholder dataset. */
export function getDashboardData(): DashboardData {
  return {
    userName: "Mehmet",
    calories: {
      goal: 2200,
      consumed: 1480,
    },
    macros: [
      { id: "protein", label: "Protein", consumed: 68, goal: 120, unit: "g" },
      { id: "carbs", label: "Karbonhidrat", consumed: 165, goal: 260, unit: "g" },
      { id: "fat", label: "Yağ", consumed: 44, goal: 70, unit: "g" },
    ],
    water: {
      current: 1250,
      goal: 2500,
      unit: "ml",
    },
    meals: [
      {
        id: "m1",
        slot: "breakfast",
        label: "Kahvaltı",
        title: "Yulaf ezmesi & yaban mersini",
        calories: 320,
      },
      {
        id: "m2",
        slot: "lunch",
        label: "Öğle Yemeği",
        title: "Izgara tavuk salata",
        calories: 540,
      },
      { id: "m3", slot: "dinner", label: "Akşam Yemeği", title: null, calories: null },
      { id: "m4", slot: "snack", label: "Atıştırmalık", title: "Badem (30 g)", calories: 180 },
    ],
    goals: [
      { id: "g1", label: "Kalori", current: 1480, target: 2200, unit: "kcal" },
      { id: "g2", label: "Adım", current: 6400, target: 10000, unit: "adım" },
      { id: "g3", label: "Su", current: 1250, target: 2500, unit: "ml" },
      { id: "g4", label: "Kilo", current: 78.4, target: 75, unit: "kg" },
    ],
    aiInsight: {
      title: "Bugünkü İçgörü",
      message:
        "Bugün protein alımınız hedefin altında görünüyor. Öğününüze yoğurt veya yumurta eklemeyi düşünebilirsiniz.",
    },
    weight: {
      current: 78.4,
      unit: "kg",
      weeklyChange: -0.6,
    },
    activity: [
      { id: "a1", label: "Adım", value: 6400, unit: "" },
      { id: "a2", label: "Yakılan Kalori", value: 420, unit: "kcal" },
      { id: "a3", label: "Egzersiz", value: 35, unit: "dk" },
    ],
  };
}
