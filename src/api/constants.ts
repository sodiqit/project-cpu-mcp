// Max characters of a non-JSON response body echoed back in the error message — enough to identify
// a gateway/error page without dumping a full HTML document into the agent's context.
export const RESPONSE_BODY_SNIPPET_LENGTH = 200;
