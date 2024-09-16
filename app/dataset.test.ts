import { describe, it, expect } from "bun:test";
import { listMessages } from "./dataset";

describe("dataset", () => {
  it("works", async () => {
    const result = await listMessages({
      direction: "asc",
      cursor: null,
    });
    expect(result.data.at(0)?.index).toEqual(999);
    expect(result.data.at(-1)?.index).toEqual(1000 - 20);
    expect(result.prev).toBeNull();
    expect(result.next).not.toBeNull();

    console.dir(result, { depth: Infinity });
  });
});
