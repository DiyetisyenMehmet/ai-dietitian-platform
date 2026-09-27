export type NutritionSourceIntegrationMode =
  | "LIVE_API"
  | "BULK_IMPORT"
  | "LICENSE_REQUIRED"
  | "REVIEW_REQUIRED";

export interface NutritionSourceRegistryEntry {
  id: "USDA" | "CNF" | "CIQUAL" | "COFID" | "OPEN_FOOD_FACTS" | "NCCDB" | "IFCDB" | "AFCD";
  name: string;
  country: string;
  commercialUse: "ALLOWED" | "LICENSE_REQUIRED" | "UNCLEAR";
  integrationMode: NutritionSourceIntegrationMode;
  attribution: string;
  licence: string;
  sourceUrl: string;
  active: boolean;
}

/**
 * Legal/source registry for Diewish nutrition data.
 * Active means the runtime may use the source. Bulk-import sources still require
 * a controlled snapshot ingestion before records become queryable.
 */
export const NUTRITION_SOURCE_REGISTRY: readonly NutritionSourceRegistryEntry[] = [
  {
    id: "USDA",
    name: "USDA FoodData Central",
    country: "US",
    commercialUse: "ALLOWED",
    integrationMode: "LIVE_API",
    attribution: "USDA FoodData Central",
    licence: "CC0 / U.S. public-domain data",
    sourceUrl: "https://fdc.nal.usda.gov/",
    active: true,
  },
  {
    id: "CNF",
    name: "Canadian Nutrient File",
    country: "CA",
    commercialUse: "ALLOWED",
    integrationMode: "LIVE_API",
    attribution: "Canadian Nutrient File, Health Canada",
    licence: "Open Government Licence - Canada",
    sourceUrl: "https://food-nutrition.canada.ca/cnf-fce/",
    active: true,
  },
  {
    id: "CIQUAL",
    name: "ANSES-CIQUAL Food Composition Table",
    country: "FR",
    commercialUse: "ALLOWED",
    integrationMode: "BULK_IMPORT",
    attribution: "ANSES-CIQUAL",
    licence: "Licence Ouverte / Open Licence 2.0 (Etalab)",
    sourceUrl: "https://zenodo.org/records/17550133",
    active: true,
  },
  {
    id: "COFID",
    name: "Composition of Foods Integrated Dataset 2021",
    country: "GB",
    commercialUse: "ALLOWED",
    integrationMode: "BULK_IMPORT",
    attribution: "UK Composition of Foods Integrated Dataset (CoFID), 2021",
    licence: "Open Government Licence v3.0",
    sourceUrl: "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid",
    active: true,
  },
  {
    id: "OPEN_FOOD_FACTS",
    name: "Open Food Facts",
    country: "GLOBAL",
    commercialUse: "ALLOWED",
    integrationMode: "LIVE_API",
    attribution: "Open Food Facts contributors",
    licence: "Open Database Licence",
    sourceUrl: "https://world.openfoodfacts.org/",
    active: true,
  },
  {
    id: "NCCDB",
    name: "Nutrition Coordinating Center Food & Nutrient Database",
    country: "US",
    commercialUse: "LICENSE_REQUIRED",
    integrationMode: "LICENSE_REQUIRED",
    attribution: "University of Minnesota Nutrition Coordinating Center",
    licence: "Commercial licence required",
    sourceUrl: "https://www.ncc.umn.edu/",
    active: false,
  },
  {
    id: "IFCDB",
    name: "Irish Food Composition Database",
    country: "IE",
    commercialUse: "UNCLEAR",
    integrationMode: "REVIEW_REQUIRED",
    attribution: "Irish Universities Nutrition Alliance / FSAI / EuroFIR",
    licence: "Commercial redistribution permission not verified",
    sourceUrl: "https://www.eurofir.org/",
    active: false,
  },
  {
    id: "AFCD",
    name: "Australian Food Composition Database",
    country: "AU",
    commercialUse: "ALLOWED",
    integrationMode: "REVIEW_REQUIRED",
    attribution: "Food Standards Australia New Zealand",
    licence: "Attribution-ShareAlike terms require product-level legal review",
    sourceUrl: "https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd",
    active: false,
  },
] as const;
