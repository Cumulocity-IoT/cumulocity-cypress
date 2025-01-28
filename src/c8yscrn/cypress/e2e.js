require("cypress-wait-until");

const enabledValues = ["true", "TRUE", true, "1", 1];
const isEnabled = !enabledValues.includes(Cypress.env("C8Y_DISABLE_WEBSOCKET"));

if (
  Cypress.config("isInteractive") &&
  Cypress.env("_c8yscrnCli") === true &&
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
