/* Runs the Yahoo Worker tests (an ES module) under npm test. */
import("./tools/yahoo-copilot/worker/test-worker.mjs").catch(function (error) {
  console.error(error);
  process.exit(1);
});
