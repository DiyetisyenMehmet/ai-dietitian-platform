import { z } from "zod";

const nonNegative = (label: string) =>
  z
    .number({ invalid_type_error: `${label} sayı olmalıdır` })
    .min(0, `${label} negatif olamaz`)
    .max(10000, `${label} çok yüksek`);

/** Validation schema for the Add Meal form. Messages are in Turkish. */
export const addMealSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Besin adı en az 2 karakter olmalıdır")
    .max(80, "Besin adı çok uzun"),
  quantity: z.string().trim().min(1, "Miktar gereklidir").max(40, "Miktar çok uzun"),
  calories: nonNegative("Kalori"),
  protein: nonNegative("Protein"),
  carbs: nonNegative("Karbonhidrat"),
  fat: nonNegative("Yağ"),
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "snack"], {
    errorMap: () => ({ message: "Öğün türü seçiniz" }),
  }),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçerli bir saat giriniz"),
});

export type AddMealInput = z.infer<typeof addMealSchema>;

/** Validation schema for editing an existing food entry (no slot/time). */
export const editFoodSchema = addMealSchema.pick({
  name: true,
  quantity: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
});

export type EditFoodInput = z.infer<typeof editFoodSchema>;
