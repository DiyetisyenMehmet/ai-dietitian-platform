import type { BloodTestAnalysis, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";

const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_MAX_DAYS = 60;
const STALE_MAX_DAYS = 90;

export type BloodTestFreshness = "CURRENT" | "STALE" | "ARCHIVED";

export interface BloodTestFreshnessAssessment {
  status: BloodTestFreshness | null;
  ageDays: number | null;
  personalizationEligible: boolean;
  message: string | null;
}

export interface PublicBloodTestAnalysis extends BloodTestAnalysis {
  testDate: string | null;
  freshness: BloodTestFreshness | null;
  freshnessAgeDays: number | null;
  personalizationEligible: boolean;
  freshnessMessage: string | null;
}

export interface DatedBloodTestAnalysis {
  analysis: BloodTestAnalysis;
  testDate: Date | null;
}

export interface BloodTestFreshnessContext {
  currentAnalysis: BloodTestAnalysis | null;
  currentTestDate: Date | null;
  latestTestDate: Date | null;
}

type AnalysisRow = Prisma.BloodTestAnalysisGetPayload<{
  include: { bloodTest: { select: { testDate: true } } };
}>;

const STALE_MESSAGE =
  "Bu tahlil güncelliğini kaybetmiş olabilir. Diewish bu sonucu yeni beslenme planı veya kişisel öneriler oluştururken kullanmayacaktır. Güncel kişiselleştirme için daha yeni bir tahlil yükleyebilirsin.";

const ARCHIVED_MESSAGE =
  "Bu tahlil geçmiş kayıtlarında saklanır ancak güncel kişiselleştirmede kullanılmaz.";

const UNDATED_MESSAGE =
  "Bu tahlilin tarihi kayıtlı olmadığı için Diewish bu sonucu güncel kişiselleştirmede kullanmayacaktır.";

function utcDateStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function assessBloodTestFreshness(
  testDate: Date | null,
  now: Date = new Date(),
): BloodTestFreshnessAssessment {
  if (!testDate) {
    return {
      status: null,
      ageDays: null,
      personalizationEligible: false,
      message: UNDATED_MESSAGE,
    };
  }

  const ageDays = Math.floor(
    (utcDateStart(now).getTime() - utcDateStart(testDate).getTime()) / DAY_MS,
  );

  if (ageDays < 0) {
    throw new ApiError(400, "Blood test date cannot be in the future.", {
      code: "FUTURE_BLOOD_TEST_DATE",
    });
  }

  if (ageDays <= CURRENT_MAX_DAYS) {
    return { status: "CURRENT", ageDays, personalizationEligible: true, message: null };
  }

  if (ageDays <= STALE_MAX_DAYS) {
    return {
      status: "STALE",
      ageDays,
      personalizationEligible: false,
      message: STALE_MESSAGE,
    };
  }

  return {
    status: "ARCHIVED",
    ageDays,
    personalizationEligible: false,
    message: ARCHIVED_MESSAGE,
  };
}

export function selectLatestCurrentBloodTestAnalysis(
  records: DatedBloodTestAnalysis[],
  now: Date = new Date(),
): DatedBloodTestAnalysis | null {
  const current = records.filter((record) => {
    try {
      return assessBloodTestFreshness(record.testDate, now).status === "CURRENT";
    } catch {
      return false;
    }
  });

  current.sort((left, right) => {
    const dateDelta = (right.testDate?.getTime() ?? 0) - (left.testDate?.getTime() ?? 0);
    return dateDelta !== 0
      ? dateDelta
      : right.analysis.createdAt.getTime() - left.analysis.createdAt.getTime();
  });

  return current[0] ?? null;
}

function toDated(row: AnalysisRow): DatedBloodTestAnalysis {
  const { bloodTest, ...analysis } = row;
  return { analysis, testDate: bloodTest.testDate };
}

export function toPublicBloodTestAnalysis(
  analysis: BloodTestAnalysis,
  testDate: Date | null,
  now: Date = new Date(),
): PublicBloodTestAnalysis {
  let assessment: BloodTestFreshnessAssessment;
  try {
    assessment = assessBloodTestFreshness(testDate, now);
  } catch {
    assessment = {
      status: null,
      ageDays: null,
      personalizationEligible: false,
      message: UNDATED_MESSAGE,
    };
  }

  return {
    ...analysis,
    testDate: testDate ? testDate.toISOString().slice(0, 10) : null,
    freshness: assessment.status,
    freshnessAgeDays: assessment.ageDays,
    personalizationEligible: assessment.personalizationEligible,
    freshnessMessage: assessment.message,
  };
}

async function rowsForUser(userId: string): Promise<AnalysisRow[]> {
  return prisma.bloodTestAnalysis.findMany({
    where: { userId },
    include: { bloodTest: { select: { testDate: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export const bloodTestFreshnessService = {
  async loadContext(userId: string, now: Date = new Date()): Promise<BloodTestFreshnessContext> {
    const rows = await rowsForUser(userId);
    const completed = rows.filter((row) => row.status === "COMPLETED").map(toDated);
    const current = selectLatestCurrentBloodTestAnalysis(completed, now);

    const validPastDates = completed
      .map((record) => record.testDate)
      .filter((date): date is Date => {
        if (!date) return false;
        try {
          assessBloodTestFreshness(date, now);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      currentAnalysis: current?.analysis ?? null,
      currentTestDate: current?.testDate ?? null,
      latestTestDate: validPastDates[0] ?? null,
    };
  },

  async listForHistory(userId: string, now: Date = new Date()): Promise<PublicBloodTestAnalysis[]> {
    const rows = await rowsForUser(userId);
    return rows.map((row) => {
      const { bloodTest, ...analysis } = row;
      return toPublicBloodTestAnalysis(analysis, bloodTest.testDate, now);
    });
  },

  async getByBloodTestIdForHistory(
    userId: string,
    bloodTestId: string,
    now: Date = new Date(),
  ): Promise<PublicBloodTestAnalysis | null> {
    const row = await prisma.bloodTestAnalysis.findFirst({
      where: { userId, bloodTestId },
      include: { bloodTest: { select: { testDate: true } } },
    });
    if (!row) return null;
    const { bloodTest, ...analysis } = row;
    return toPublicBloodTestAnalysis(analysis, bloodTest.testDate, now);
  },
};
