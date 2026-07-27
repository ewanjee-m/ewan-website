import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorldCameraInput } from "../app/world/WorldCameraInput";

describe("world camera pointer input", () => {
  const blockedOrigins = [
    {
      name: "data-world-input-block",
      create: () => {
        const element = document.createElement("div");
        element.dataset.worldInputBlock = "true";
        return element;
      }
    },
    {
      name: "button",
      create: () => document.createElement("button")
    },
    {
      name: "link",
      create: () => document.createElement("a")
    },
    {
      name: "dialog",
      create: () => {
        const element = document.createElement("div");
        element.setAttribute("role", "dialog");
        return element;
      }
    },
    {
      name: "map",
      create: () => {
        const element = document.createElement("div");
        element.className = "rpg-world-map";
        return element;
      }
    },
    {
      name: "joystick",
      create: () => {
        const element = document.createElement("div");
        element.className = "mobile-move-zone";
        return element;
      }
    }
  ] as const;

  it.each(blockedOrigins)(
    "rejects a primary pointer start from a $name descendant in the production handler",
    ({ create }) => {
      const onDrag = vi.fn();
      render(<WorldCameraInput label="Rotate camera" onDrag={onDrag} />);
      const layer = screen.getByLabelText("Rotate camera");
      const blocked = create();
      const descendant = document.createElement("span");
      blocked.append(descendant);
      layer.append(blocked);

      fireEvent.pointerDown(descendant, {
        pointerId: 19,
        pointerType: "touch",
        isPrimary: true,
        clientX: 50,
        clientY: 50
      });
      fireEvent.pointerMove(layer, {
        pointerId: 19,
        pointerType: "touch",
        clientX: 80,
        clientY: 70
      });

      expect(onDrag).not.toHaveBeenCalled();
    }
  );

  it("accepts one primary world drag and rejects UI or second-touch starts", () => {
    const onDrag = vi.fn();
    const { container } = render(
      <div>
        <WorldCameraInput label="Rotate camera" onDrag={onDrag} />
        <button data-world-input-block="true">Map</button>
      </div>
    );
    const layer = screen.getByLabelText("Rotate camera");
    fireEvent.pointerDown(layer, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 300,
      clientY: 300
    });
    fireEvent.pointerDown(layer, {
      pointerId: 2,
      pointerType: "touch",
      isPrimary: false,
      clientX: 320,
      clientY: 300
    });
    fireEvent.pointerMove(layer, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 360,
      clientY: 300
    });
    expect(onDrag).not.toHaveBeenCalled();
    fireEvent.pointerMove(layer, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 312,
      clientY: 294
    });
    expect(onDrag).toHaveBeenCalledWith(12, -6, "touch");
    fireEvent.pointerDown(container.querySelector("button")!, {
      pointerId: 3,
      pointerType: "mouse",
      isPrimary: true
    });
    expect(onDrag).toHaveBeenCalledTimes(1);
  });

  it("lets a finger look around while another holds the movement stick", () => {
    // On a phone the thumb on the stick is the primary pointer for as long as
    // it is held, so a camera drag that insisted on primary meant a visitor
    // walking could never turn at the same time.
    const onDrag = vi.fn();
    render(
      <div>
        <div className="mobile-move-zone">stick</div>
        <WorldCameraInput label="Rotate camera" onDrag={onDrag} />
      </div>
    );
    const stick = screen.getByText("stick");
    fireEvent.pointerDown(stick, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: 40,
      clientY: 700
    });

    const layer = screen.getByLabelText("Rotate camera");
    fireEvent.pointerDown(layer, {
      pointerId: 2,
      pointerType: "touch",
      isPrimary: false,
      clientX: 300,
      clientY: 300
    });
    fireEvent.pointerMove(layer, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 340,
      clientY: 290
    });

    expect(onDrag).toHaveBeenCalledWith(40, -10, "touch");
  });

  it("releases ownership after lost pointer capture", () => {
    const onDrag = vi.fn();
    render(<WorldCameraInput label="Rotate camera" onDrag={onDrag} />);
    const layer = screen.getByLabelText("Rotate camera");

    fireEvent.pointerDown(layer, {
      pointerId: 4,
      pointerType: "pen",
      isPrimary: true,
      clientX: 10,
      clientY: 10
    });
    fireEvent.lostPointerCapture(layer, { pointerId: 4 });
    fireEvent.pointerDown(layer, {
      pointerId: 5,
      pointerType: "mouse",
      isPrimary: true,
      clientX: 20,
      clientY: 20
    });
    fireEvent.pointerMove(layer, {
      pointerId: 5,
      pointerType: "mouse",
      clientX: 25,
      clientY: 18
    });

    expect(onDrag).toHaveBeenCalledWith(5, -2, "mouse");
  });

  it("optionally captures and releases the active pointer", () => {
    const onDrag = vi.fn();
    render(<WorldCameraInput label="Rotate camera" onDrag={onDrag} />);
    const layer = screen.getByLabelText("Rotate camera") as HTMLDivElement;
    layer.setPointerCapture = vi.fn();
    layer.hasPointerCapture = vi.fn(() => true);
    layer.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(layer, {
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true
    });
    fireEvent.pointerUp(layer, { pointerId: 7, pointerType: "mouse" });

    expect(layer.setPointerCapture).toHaveBeenCalledWith(7);
    expect(layer.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("places the layer above the canvas, below controls, and on the coarse-pointer right side", () => {
    const stylesheet = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8"
    );

    expect(stylesheet).toMatch(
      /\.world-camera-input\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*4;/s
    );
    expect(stylesheet).toMatch(
      /@media\s*\(pointer:\s*coarse\)\s*\{[^}]*\.world-camera-input\s*\{[^}]*left:\s*45%;/s
    );
    expect(stylesheet).toMatch(
      /\.world-camera-input\s*\{[^}]*touch-action:\s*none;/s
    );
  });
});
