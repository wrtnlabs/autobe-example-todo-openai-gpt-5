import { IPage } from "./IPage";
import { ITodoAppServicePolicy } from "./ITodoAppServicePolicy";

export namespace IPageITodoAppServicePolicy {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppServicePolicy.ISummary[];
  };
}
