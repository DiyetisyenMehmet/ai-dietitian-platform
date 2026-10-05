import {
  OpenAICompatibleAdapter,
  type ChatMessage,
} from "../../blood-test-analysis/ai-adapter/openai-compatible.adapter";

/** Controlled provider transport; production prompt, parsing and validators still run. */
export class FixtureAdapter extends OpenAICompatibleAdapter {
  calls = 0;
  mode: "valid" | "malformed-once" | "malformed" | "incomplete" | "invalid-once" = "valid";
  delay = 0;
  slowVegetarianDelay = 0;
  constructor() {
    super({
      apiKey: "test-only",
      baseUrl: "http://unused",
      model: "fixture",
      maxTokens: 4096,
      temperature: 0,
    });
  }
  protected async chat(messages: ChatMessage[]): Promise<string> {
    this.calls++;
    if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
    if (this.mode === "malformed" || (this.mode === "malformed-once" && this.calls === 1))
      return "{broken}";
    const input = JSON.parse(String(messages.at(-1)!.content).split("Plan inputs:\n")[1]);
    if (input.dietaryPreference === "VEGETARIAN" && this.slowVegetarianDelay) {
      await new Promise((r) => setTimeout(r, this.slowVegetarianDelay));
    }
    const target = input.targets;
    const count = input.mealTiming.mealsPerDay;
    const invalid = this.mode === "invalid-once" && this.calls === 1;
    const days = this.mode === "incomplete" && input.startDayNumber > 5 ? 0 : input.cycleLengthDays;
    return JSON.stringify({
      cycle: Array.from({ length: days }, (_, day) => ({
        dayLabel: `${input.startDayNumber + day}. Gün`,
        meals: Array.from({ length: count }, (_, index) => ({
          name: input.mealTiming.slots[index].name,
          time: input.mealTiming.slots[index].time,
          foods: [
            {
              name: "Mercimek ve bulgur",
              ingredients: ["mercimek", "bulgur", "zeytinyağı"],
              portion: "1 porsiyon",
              calories: target.dailyCalories / count,
            },
          ],
          calories: invalid ? 1 : target.dailyCalories / count,
          proteinGrams: target.proteinGrams / count,
          carbsGrams: target.carbsGrams / count,
          fatGrams: target.fatGrams / count,
          explanation: "Test fixture",
        })),
        totalCalories: invalid ? count : target.dailyCalories,
        totalProteinGrams: target.proteinGrams,
        totalCarbsGrams: target.carbsGrams,
        totalFatGrams: target.fatGrams,
      })),
      explanations: {},
      recommendations: [],
      summary: "Test fixture",
    });
  }
}
