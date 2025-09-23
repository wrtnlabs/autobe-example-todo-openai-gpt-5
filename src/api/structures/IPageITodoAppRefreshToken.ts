import { IPage } from "./IPage";
import { ITodoAppRefreshToken } from "./ITodoAppRefreshToken";

export namespace IPageITodoAppRefreshToken {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppRefreshToken.ISummary[];
  };
}
