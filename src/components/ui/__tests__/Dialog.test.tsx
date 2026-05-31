import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../dialog";

describe("Dialog", () => {
  it("opens when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <p>Dialog body</p>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByText("Dialog Title")).not.toBeInTheDocument();
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Dialog Title")).toBeInTheDocument();
    expect(screen.getByText("Dialog description")).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
  });

  it("closes when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Closeable</DialogTitle>
          <p>Content</p>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText("Closeable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText("Closeable")).not.toBeInTheDocument();
  });

  it("renders DialogHeader with correct classes", () => {
    const { container } = render(<DialogHeader className="extra">Header</DialogHeader>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("flex");
    expect(el.className).toContain("extra");
  });

  it("renders DialogFooter with correct classes", () => {
    const { container } = render(<DialogFooter className="extra">Footer</DialogFooter>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("sm:flex-row");
    expect(el.className).toContain("extra");
  });

  it("renders DialogTitle as heading", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>My Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    const title = screen.getByText("My Title");
    expect(title.className).toContain("font-semibold");
  });

  it("renders DialogDescription with muted text", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Details here</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Details here").className).toContain("text-muted-foreground");
  });

  it("applies custom className to DialogContent", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent className="custom-content">
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    // The content is rendered inside a portal, query by role
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("custom-content");
  });
});
