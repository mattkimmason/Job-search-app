import type { Job, StatusModel } from "../types";

export function safe(value: unknown): string {
  return String(value ?? "");
}

export function dollars(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "Unknown";
  return `$${Math.round(num / 1000)}k`;
}

export function parseSalary(label: unknown) {
  const values =
    String(label || "")
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number) || [];
  if (!values.length) return null;
  const scaled = values.map((n) => (n < 1000 ? n * 1000 : n));
  return {
    min: Math.min(...scaled),
    max: Math.max(...scaled),
    label: String(label || ""),
  };
}

export function unifiedStatuses(statusModel: StatusModel | null): string[] {
  if (!statusModel) return [];
  const interviewStatuses = statusModel.interviewStatus.filter(
    (status) => status !== "waiting",
  );
  return [
    ...statusModel.discoveryStatus,
    ...statusModel.applicationStatus,
    ...interviewStatuses,
  ];
}

export function getUnifiedStatus(job: Job): string {
  if (job.interviewStatus && job.interviewStatus !== "waiting")
    return job.interviewStatus;
  if (job.applicationStatus && job.applicationStatus !== "not_started")
    return job.applicationStatus;
  return job.discoveryStatus || "new";
}

export function mapUnifiedStatusToModel(
  job: Job,
  unifiedStatus: string,
  statusModel: StatusModel | null,
) {
  const next = {
    discoveryStatus: job.discoveryStatus || "new",
    applicationStatus: job.applicationStatus || "not_started",
    interviewStatus: job.interviewStatus || "waiting",
  };

  if (!statusModel) return next;

  if (statusModel.discoveryStatus.includes(unifiedStatus)) {
    next.discoveryStatus = unifiedStatus;
    if (unifiedStatus === "not_a_fit") {
      next.applicationStatus = "rejected";
      next.interviewStatus = "closed";
    }
    return next;
  }

  if (statusModel.applicationStatus.includes(unifiedStatus)) {
    next.applicationStatus = unifiedStatus;
    if (unifiedStatus === "applied" || unifiedStatus === "in_progress") {
      if (
        next.discoveryStatus === "new" ||
        next.discoveryStatus === "researching"
      ) {
        next.discoveryStatus = "target";
      }
      if (next.interviewStatus === "closed") {
        next.interviewStatus = "waiting";
      }
    }
    if (unifiedStatus === "rejected") {
      next.interviewStatus = "closed";
    }
    return next;
  }

  if (statusModel.interviewStatus.includes(unifiedStatus)) {
    next.interviewStatus = unifiedStatus;
    if (
      next.applicationStatus === "not_started" ||
      next.applicationStatus === "in_progress"
    ) {
      next.applicationStatus = "applied";
    }
    if (
      next.discoveryStatus === "new" ||
      next.discoveryStatus === "researching"
    ) {
      next.discoveryStatus = "target";
    }
    return next;
  }

  return next;
}

export function looksLikeCsv(text: string): boolean {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return false;
  const firstLine = lines[0];
  if (firstLine.includes("|")) return false;
  const cells = firstLine.split(",").map((part) => part.trim());
  if (cells.length < 2 || cells.length > 20) return false;
  if (cells.some((cell) => cell.length > 40)) return false;
  const headers = cells.map((cell) => cell.toLowerCase());
  const hasCompany = headers.some((header) =>
    /\b(company|employer|organi[sz]ation|org)\b/.test(header),
  );
  const hasTitle = headers.some((header) =>
    /\b(title|role|position)\b/.test(header),
  );
  return hasCompany && hasTitle;
}
