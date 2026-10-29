// When a customer answers, the database says what happened. This file turns that into a status number and a plain message
// for the browser (200 means fine, 404 means not found, and so on).

// Our reply has two parts: a number code, and a body with the outcome plus a friendly error if something went wrong.
export type DecisionResponse = {
  status: number;
  body: { status: string; error?: string };
};

// Pick the right reply for whatever the database told us.
export function decisionResponse(status: string | undefined): DecisionResponse {
  // Everything worked, the answer was saved.
  if (status === "decided") {
    return { status: 200, body: { status } };
  }
  // Link was already used, so a second click can't change the answer (409 means "conflict").
  if (status === "already_decided") {
    return {
      status: 409,
      body: { status, error: "This approval link has already been used." },
    };
  }
  // The link's too old (410 means "gone").
  if (status === "signature_required") {
    return {
      status: 400,
      body: { status, error: "Please sign in the box to approve." },
    };
  }
  if (status === "expired") {
    return {
      status: 410,
      body: { status, error: "This approval link has expired." },
    };
  }
  // The change order was edited after this link went out, so the old link doesn't apply anymore.
  if (status === "outdated") {
    return {
      status: 410,
      body: {
        status,
        error: "This approval link is for an older version and is no longer valid.",
      },
    };
  }
  return {
    status: 404,
    // Anything else we don't recognize gets treated as a bad link (404 means "not found").
    body: { status: "invalid", error: "This approval link is not valid." },
  };
}
