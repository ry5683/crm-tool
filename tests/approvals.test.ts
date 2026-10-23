import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decisionResponse } from "../src/lib/approval-decision";

describe("approval decision responses", () => {
  it("rejects expired links", () => {
    const response = decisionResponse("expired");
    assert.equal(response.status, 410);
    assert.match(response.body.error ?? "", /expired/i);
  });

  it("rejects a reused approval link", () => {
    const response = decisionResponse("already_decided");
    assert.equal(response.status, 409);
    assert.match(response.body.error ?? "", /already been used/i);
  });

  it("rejects links for an outdated version", () => {
    const response = decisionResponse("outdated");
    assert.equal(response.status, 410);
    assert.match(response.body.error ?? "", /older version/i);
  });

  it("treats a repeat click as already decided after the first decision", () => {
    const firstClick = decisionResponse("decided");
    const secondClick = decisionResponse("already_decided");

    assert.equal(firstClick.status, 200);
    assert.equal(firstClick.body.status, "decided");
    assert.equal(secondClick.status, 409);
    assert.equal(secondClick.body.status, "already_decided");
  });

  it("does not reveal information for unknown tokens", () => {
    const response = decisionResponse("unexpected");
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      status: "invalid",
      error: "This approval link is not valid.",
    });
  });
});
