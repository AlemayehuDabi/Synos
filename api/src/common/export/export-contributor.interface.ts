export interface ExportContributor {
  /** Unique key this contributor's data will be namespaced under in the export JSON. */
  readonly name: string;
  collect(userId: string): Promise<unknown>;
}
