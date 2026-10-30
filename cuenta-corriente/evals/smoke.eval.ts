import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Reads the default tracking preference via get_tracking_preference.",
  async test(t) {
    await t.send(
      "Sin parsear nada aún: usa la herramienta get_tracking_preference y dime la cadencia actual.",
    );
    t.succeeded();
    t.calledTool("get_tracking_preference");
  },
});
