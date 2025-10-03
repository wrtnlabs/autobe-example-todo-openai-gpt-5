export namespace IResult {
  /**
   * Generic success result DTO for simple acknowledgement responses (e.g.,
   * logout).
   *
   * This structure is intentionally minimal for MVP flows where no complex
   * payload is required beyond confirming success.
   */
  export type ISuccess = {
    /**
     * Indicates operation outcome.
     *
     * For successful operations, this value is true.
     */
    success: boolean;

    /**
     * Optional human-readable confirmation message.
     *
     * Intended for client display. Keep language concise and non-technical.
     */
    message?: string | undefined;
  };
}
