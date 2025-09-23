import { IPage } from "./IPage";
import { ITodoAppTodoDeletionEvent } from "./ITodoAppTodoDeletionEvent";

export namespace IPageITodoAppTodoDeletionEvent {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ITodoAppTodoDeletionEvent.ISummary[];
  };
}
