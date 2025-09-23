import { IPage } from "./IPage";
import { ITodoAppRateLimit } from "./ITodoAppRateLimit";

export namespace IPageITodoAppRateLimit {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppRateLimit.ISummary[];
  };
}
