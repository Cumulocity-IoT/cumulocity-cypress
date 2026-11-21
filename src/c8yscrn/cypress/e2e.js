require("cypress-wait-until");

// reads a variable of the Cypress environment like c8yEnv() of src/shared/cypressenv.ts:
// Cypress.env() if available, Cypress.expose() with Cypress 16, which removed Cypress.env()
function envValue(key) {
  if (typeof Cypress.env === "function") {
    try {
      const value = Cypress.env(key);
      if (value !== undefined) return value;
    } catch {
      // Cypress 15.10+ throws if allowCypressEnv is false
    }
  }
  return typeof Cypress.expose === "function" ? Cypress.expose(key) : undefined;
}

const enabledValues = ["true", "TRUE", true, "1", 1];
const isEnabled = !enabledValues.includes(envValue("C8Y_DISABLE_WEBSOCKET"));

if (
  Cypress.config("isInteractive") &&
  envValue("_c8yscrnCli") === true &&
  isEnabled
) {
  const ws = new WebSocket("ws://localhost:9345");
  beforeEach(() => {
    cy.waitUntil(() => ws.readyState === WebSocket.OPEN, {
      timeout: 2000,
      interval: 50,
      errorMsg:
        "WebSocket did not open in time. You might want to WebSocket using C8Y_DISABLE_WEBSOCKET.",
    }).then(() => {
      ws.onmessage = (message) => {
        if (message.type !== "message" || message.data == null) return;
        try {
          const data = JSON.parse(message.data);
          if (data.command === "reload" && data.config != null) {
            console.log(`Received reload command with config`, data.config);
            localStorage.setItem("_c8yscrnConfig", JSON.stringify(data.config));
            const restartBtn =
              window.top.document.querySelector(".reporter .restart");
            restartBtn ? restartBtn.click() : window.top.location.reload();
          }
        } catch (e) {
          console.error("Error reloading from config: ", e);
        }
      };
    });
  });
}
