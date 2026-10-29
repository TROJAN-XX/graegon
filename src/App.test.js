import { render, screen } from "@testing-library/react";
import App from "./App";

// Smoke test: the route table mounts and the public "/" screen (Login) renders.
// Keep this file router/firebase safe - see development.md -> Testing.
test("renders the Graegon login screen on the default route", () => {
  render(<App />);

  expect(screen.getAllByText("Graegon").length).toBeGreaterThan(0);
  expect(
    screen.getByPlaceholderText("Email address"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
});

test("offers a path for new users to request access", () => {
  render(<App />);

  expect(
    screen.getByRole("button", { name: /new user\? request access/i }),
  ).toBeInTheDocument();
});
