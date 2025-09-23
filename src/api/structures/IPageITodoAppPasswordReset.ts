import { IPage } from "./IPage";
import { ITodoAppPasswordReset } from "./ITodoAppPasswordReset";

export namespace IPageITodoAppPasswordReset {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppPasswordReset.ISummary[];
  };
}
