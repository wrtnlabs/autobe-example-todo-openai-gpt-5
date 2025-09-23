import { IPage } from "./IPage";
import { ITodoAppTodoActivity } from "./ITodoAppTodoActivity";

export namespace IPageITodoAppTodoActivity {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppTodoActivity.ISummary[];
  };
}
