import { IPage } from "./IPage";
import { ITodoAppEmailVerification } from "./ITodoAppEmailVerification";

export namespace IPageITodoAppEmailVerification {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppEmailVerification.ISummary[];
  };
}
