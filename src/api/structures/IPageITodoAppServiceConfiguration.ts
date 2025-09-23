import { IPage } from "./IPage";
import { ITodoAppServiceConfiguration } from "./ITodoAppServiceConfiguration";

export namespace IPageITodoAppServiceConfiguration {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppServiceConfiguration.ISummary[];
  };
}
