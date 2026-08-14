export type LogSeverity = "DEBUG" | "INFO" | "NOTICE" | "WARNING" | "ERROR";

export interface LogContext {
  requestId?: string;
  traceId?: string;
  userId?: string;
  triggerId?: string;
  runId?: string;
  component?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface StructuredLogger {
  write(severity: LogSeverity, message: string, context?: LogContext): void;
}

export function createStructuredLogger(
  projectId: string | null,
  sink: (line: string) => void = console.log,
): StructuredLogger {
  return {
    write(severity, message, context = {}) {
      const trace = context.traceId && projectId
        ? `projects/${projectId}/traces/${context.traceId}`
        : undefined;
      const entry = {
        severity,
        message,
        timestamp: new Date().toISOString(),
        ...context,
        ...(trace ? { "logging.googleapis.com/trace": trace } : {}),
      };
      sink(JSON.stringify(entry));
    },
  };
}

export function traceIdFromHeader(header: string | undefined): string | undefined {
  const candidate = header?.split("/")[0]?.trim();
  return candidate && /^[a-f\d]{32}$/i.test(candidate) ? candidate : undefined;
}
