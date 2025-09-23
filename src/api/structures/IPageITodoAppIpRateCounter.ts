import { IPage } from "./IPage";
import { ITodoAppIpRateCounter } from "./ITodoAppIpRateCounter";

export namespace IPageITodoAppIpRateCounter {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppIpRateCounter.ISummary[];
  };
}
