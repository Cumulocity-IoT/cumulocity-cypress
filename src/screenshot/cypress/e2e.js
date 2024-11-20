require("cypress-wait-until");

if (Cypress.config("isInteractive") && Cypress.env("_c8yscrnCli") === true) {
  const ws = new WebSocket("ws://localhost:9345");
  beforeEach(() => {
    cy.waitUntil(() => ws.readyState === WebSocket.OPEN, {
      timeout: 2000,
      interval: 50,
      errorMsg: "WebSocket did not open in time",
    }).then(() => {
      ws.onmessage = (message) => {
        if (message.type !== "message" || message.data == null) return;
        try {
          const data = JSON.parse(message.data);
          if (data.command === "reload" && data.config != null) {
            console.log(`Received reload command with config`);
            localStorage.setItem("_c8yscrnConfig", JSON.stringify(data))
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
