import { IPage } from "./IPage";
import { ITodoAppSystemAdmin } from "./ITodoAppSystemAdmin";

export namespace IPageITodoAppSystemAdmin {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppSystemAdmin.ISummary[];
  };
}
