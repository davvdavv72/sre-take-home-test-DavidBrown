import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Modal } from "./modal.tsx";

describe("Modal", () => {
  it("should open and close", () => {
    render(
      <Modal open={false} onClose={() => undefined}>
        Closed modal
      </Modal>,
    );
    expect(screen.queryByText("Closed modal")).toBeFalsy();

    render(
      <Modal open onClose={() => undefined}>
        <div>Open modal</div>
      </Modal>,
    );
    expect(screen.getByText("Open modal")).toBeTruthy();
  });
});
