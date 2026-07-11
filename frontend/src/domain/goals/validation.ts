import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Validation schema for the Create/Edit Goal form. Messages are in Turkish. */
export const goalFormSchema = z
  .object({
    type: z.enum(
      [
        "lose-weight",
        "gain-weight",
        "maintain-weight",
        "daily-calories",
        "protein",
        "water",
        "steps",
        "exercise",
      ],
      { errorMap: () => ({ message: "Hedef türü seçiniz" }) },
    ),
    title: z.string().trim().max(80, "Başlık çok uzun").optional().or(z.literal("")),
    targetValue: z
      .number({ invalid_type_error: "Hedef değer sayı olmalıdır" })
      .positive("Hedef değer 0'dan büyük olmalıdır")
      .max(100000, "Hedef değer çok yüksek"),
    startDate: z.string().regex(isoDate, "Geçerli bir başlangıç tarihi giriniz"),
    targetDate: z.string().regex(isoDate, "Geçerli bir hedef tarihi giriniz"),
    reminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçerli bir saat giriniz")
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(500, "Not çok uzun").optional().or(z.literal("")),
  })
  .refine((data) => new Date(data.targetDate) >= new Date(data.startDate), {
    message: "Hedef tarihi, başlangıç tarihinden sonra olmalıdır",
    path: ["targetDate"],
  });

export type GoalFormInput = z.infer<typeof goalFormSchema>;
