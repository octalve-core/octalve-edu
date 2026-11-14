export const DB_NAME_PATTERN: RegExp;
export function assertWalkthroughDbName(name: unknown): string;
export function assertLocalDatabaseHost(databaseUrl: string): string;
export function assertCurrentDatabase(expected: string, actual: string): void;
export function assertNoOtherConnections(count: number | string, name: string): void;
export function generateSetupToken(): string;
