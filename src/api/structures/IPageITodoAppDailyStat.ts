import { IPage } from "./IPage";
import { ITodoAppDailyStat } from "./ITodoAppDailyStat";

export namespace IPageITodoAppDailyStat {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppDailyStat.ISummary[];
  };
}
