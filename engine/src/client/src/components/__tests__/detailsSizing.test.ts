import { expect, test } from "bun:test";
import { resizedDetailsWidth } from "../detailsSizing";

test("dragging the left edge resizes details without hiding the board", () => {
  expect(resizedDetailsWidth(420, 900, 750, 1200)).toBe(570);
  expect(resizedDetailsWidth(420, 900, 1300, 1200)).toBe(320);
  expect(resizedDetailsWidth(420, 900, 100, 1200)).toBe(850);
});
