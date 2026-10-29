import { FormStatus, TurnInStatus } from "@prisma/client";

export interface PaperWorkInput {
  title: string;
  instructions?: string | null;
  classGroupIds: string[];
  opensAt?: string | null;
  closesAt?: string | null;
  maxDurationMinutes?: number | null;
}

export interface PaperWorkValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates paper work creation or update input.
 */
export function validatePaperWorkInput(input: PaperWorkInput): PaperWorkValidationResult {
  const errors: string[] = [];

  const title = input.title?.trim();
  if (!title || title.length === 0) {
    errors.push("Title is required.");
  } else if (title.length > 200) {
    errors.push("Title cannot exceed 200 characters.");
  }

  if (input.instructions && input.instructions.length > 5000) {
    errors.push("Instructions cannot exceed 5000 characters.");
  }

  if (!input.classGroupIds || !Array.isArray(input.classGroupIds) || input.classGroupIds.length === 0) {
    errors.push("Paper work requires at least one target class group.");
  }

  let opensAtDate: Date | null = null;
  let closesAtDate: Date | null = null;

  if (input.opensAt) {
    opensAtDate = new Date(input.opensAt);
    if (isNaN(opensAtDate.getTime())) {
      errors.push("Invalid opensAt date.");
    }
  }

  if (input.closesAt) {
    closesAtDate = new Date(input.closesAt);
    if (isNaN(closesAtDate.getTime())) {
      errors.push("Invalid closesAt date.");
    }
  }

  if (opensAtDate && closesAtDate && closesAtDate <= opensAtDate) {
    errors.push("closesAt must be later than opensAt.");
  }

  if (input.maxDurationMinutes !== undefined && input.maxDurationMinutes !== null) {
    if (!Number.isInteger(input.maxDurationMinutes) || input.maxDurationMinutes < 1 || input.maxDurationMinutes > 1440) {
      errors.push("maxDurationMinutes must be an integer between 1 and 1440.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks whether a paper work assignment is currently open.
 */
export function isPaperWorkOpen(
  form: {
    status: FormStatus;
    opensAt?: Date | string | null;
    closesAt?: Date | string | null;
    closedAt?: Date | string | null;
  },
  now: Date = new Date(),
): boolean {
  if (form.status !== FormStatus.PUBLISHED) {
    return false;
  }

  if (form.closedAt) {
    return false;
  }

  if (form.opensAt && now < new Date(form.opensAt)) {
    return false;
  }

  if (form.closesAt && now > new Date(form.closesAt)) {
    return false;
  }

  return true;
}

/**
 * Evaluates whether marking a paper work hand-in should automatically be classified
 * as LATE based on form deadline and submission time.
 */
export function determineTurnInStatus(
  form: { closesAt?: Date | string | null },
  targetStatus: TurnInStatus,
  turnInTime: Date = new Date(),
): TurnInStatus {
  if (targetStatus === TurnInStatus.PENDING) {
    return TurnInStatus.PENDING;
  }

  if (targetStatus === TurnInStatus.LATE) {
    return TurnInStatus.LATE;
  }

  if (form.closesAt && turnInTime > new Date(form.closesAt)) {
    return TurnInStatus.LATE;
  }

  return TurnInStatus.HANDED_IN;
}

/**
 * Validates whether a pupil is permitted to request marking on their paper work.
 */
export function canPupilRequestMarking(
  turnIn: {
    status: TurnInStatus;
    requestedAt?: Date | string | null;
  },
  form: {
    status: FormStatus;
    opensAt?: Date | string | null;
    closesAt?: Date | string | null;
    closedAt?: Date | string | null;
  },
  now: Date = new Date(),
): { allowed: boolean; reason?: string } {
  if (form.status === FormStatus.CLOSED || form.closedAt) {
    return {
      allowed: false,
      reason: "Paper work has been closed by the teacher.",
    };
  }

  if (form.status !== FormStatus.PUBLISHED) {
    return {
      allowed: false,
      reason: "Paper work is not published or has been archived.",
    };
  }

  if (form.opensAt && now < new Date(form.opensAt)) {
    return {
      allowed: false,
      reason: "Paper work is not open yet.",
    };
  }

  if (turnIn.status !== TurnInStatus.PENDING) {
    return {
      allowed: false,
      reason: "Paper work has already been marked as submitted.",
    };
  }

  return { allowed: true };
}

export interface RollCallSummary {
  totalStudents: number;
  handedInCount: number;
  lateCount: number;
  pendingCount: number;
  requestedMarkingCount: number;
  completionRate: number;
}

/**
 * Aggregates roll call records for a paper work form into summary metrics.
 */
export function computeRollCallSummary(
  turnIns: Array<{
    status: TurnInStatus;
    requestedAt?: Date | string | null;
  }>,
): RollCallSummary {
  const totalStudents = turnIns.length;
  let handedInCount = 0;
  let lateCount = 0;
  let pendingCount = 0;
  let requestedMarkingCount = 0;

  for (const turnIn of turnIns) {
    if (turnIn.status === TurnInStatus.HANDED_IN) {
      handedInCount++;
    } else if (turnIn.status === TurnInStatus.LATE) {
      lateCount++;
    } else {
      pendingCount++;
      if (turnIn.requestedAt) {
        requestedMarkingCount++;
      }
    }
  }

  const completionRate = totalStudents === 0 ? 0 : Math.round(((handedInCount + lateCount) / totalStudents) * 100);

  return {
    totalStudents,
    handedInCount,
    lateCount,
    pendingCount,
    requestedMarkingCount,
    completionRate,
  };
}
