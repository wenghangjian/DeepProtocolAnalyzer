import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../Tabs";

function renderTabs() {
  return render(
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
      <TabsContent value="tab3">Content 3</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders tab triggers", () => {
    renderTabs();
    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
    expect(screen.getByText("Tab 3")).toBeInTheDocument();
  });

  it("shows default tab content", () => {
    renderTabs();
    expect(screen.getByText("Content 1")).toBeInTheDocument();
    expect(screen.queryByText("Content 2")).not.toBeInTheDocument();
  });

  it("switches content on tab click", async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByText("Tab 2"));
    expect(screen.getByText("Content 2")).toBeInTheDocument();
    expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
  });

  it("applies active styles to selected tab", () => {
    renderTabs();
    const tab1 = screen.getByText("Tab 1");
    expect(tab1.dataset.state).toBe("active");
    const tab2 = screen.getByText("Tab 2");
    expect(tab2.dataset.state).toBe("inactive");
  });

  it("applies custom className to TabsList", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList className="custom-list">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole("tablist").className).toContain("custom-list");
  });

  it("applies custom className to TabsTrigger", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" className="custom-trigger">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>
    );
    expect(screen.getByText("A").className).toContain("custom-trigger");
  });

  it("applies custom className to TabsContent", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="custom-content">A content</TabsContent>
      </Tabs>
    );
    expect(screen.getByText("A content").className).toContain("custom-content");
  });

  it("TabsList applies muted background", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList data-testid="list">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content</TabsContent>
      </Tabs>
    );
    expect(screen.getByTestId("list").className).toContain("bg-muted");
  });
});
