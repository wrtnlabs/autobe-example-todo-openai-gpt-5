import { IPage } from "./IPage";
import { ITodoAppAccountDeletionRequest } from "./ITodoAppAccountDeletionRequest";

export namespace IPageITodoAppAccountDeletionRequest {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppAccountDeletionRequest.ISummary[];
  };
}
