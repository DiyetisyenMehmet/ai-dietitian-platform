import { nutritionDataRouter } from "./nutrition-data.routes";

export const nutritionDataModule = {
  routes: [{ path: "/nutrition", router: nutritionDataRouter }],
} as const;
