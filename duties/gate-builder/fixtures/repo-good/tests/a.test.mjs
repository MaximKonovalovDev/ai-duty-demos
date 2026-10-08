import assert from "node:assert/strict";
import test from "node:test";
test("a one", () => assert.equal(1 + 1, 2));
test("a two", () => assert.ok(true));
