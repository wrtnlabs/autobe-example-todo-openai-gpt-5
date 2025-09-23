import { IPage } from "./IPage";
import { ITodoAppAggregatedMetric } from "./ITodoAppAggregatedMetric";

export namespace IPageITodoAppAggregatedMetric {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppAggregatedMetric.ISummary[];
  };
}
