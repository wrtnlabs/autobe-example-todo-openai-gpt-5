import { IPage } from "./IPage";
import { ITodoAppDataExport } from "./ITodoAppDataExport";

export namespace IPageITodoAppDataExport {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppDataExport.ISummary[];
  };
}
